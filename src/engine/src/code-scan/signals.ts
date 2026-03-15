/**
 * Aggregates raw CodeFindings into deduplicated RiskSignals suitable for
 * inclusion in an AnalysisReport.
 *
 * One RiskSignal is produced per distinct rule. If the same rule fires across
 * multiple files, all affected file paths are listed in the evidence array.
 * Score impact is applied once per rule regardless of how many files triggered it.
 */
import type { RiskSignal, Severity } from '@extensionchecker/shared';
import type { CodeFinding, CodeFindingRule } from './types';

interface SignalMeta {
  title: string;
  description: string;
  severity: Severity;
  scoreImpact: number;
}

const SIGNAL_METADATA: Record<CodeFindingRule, SignalMeta> = {
  eval_usage: {
    title: 'Dynamic code execution via eval()',
    description: 'The extension calls eval(), which executes an arbitrary string as code at runtime. This is a primary mechanism for loading obfuscated or remotely-fetched payloads.',
    severity: 'high',
    scoreImpact: 12
  },
  dynamic_function: {
    title: 'Dynamic function construction via new Function()',
    description: 'The extension constructs functions dynamically from strings using new Function(). This is functionally equivalent to eval() and can execute arbitrary code at runtime.',
    severity: 'high',
    scoreImpact: 12
  },
  setTimeout_string: {
    title: 'setTimeout() called with a string argument',
    description: 'setTimeout() is called with a string literal as its first argument, which is evaluated as code — equivalent to eval().',
    severity: 'medium',
    scoreImpact: 5
  },
  setInterval_string: {
    title: 'setInterval() called with a string argument',
    description: 'setInterval() is called with a string literal as its first argument, which is evaluated as code — equivalent to eval().',
    severity: 'medium',
    scoreImpact: 5
  },
  innerHTML_assignment: {
    title: 'innerHTML assignment detected',
    description: 'The extension assigns content to element.innerHTML. When the value originates from a network response, extension messaging, or external storage, this is an XSS vector.',
    severity: 'medium',
    scoreImpact: 5
  },
  outerHTML_assignment: {
    title: 'outerHTML assignment detected',
    description: 'The extension assigns content to element.outerHTML. When the value is externally sourced, this allows arbitrary DOM replacement and is an XSS vector.',
    severity: 'medium',
    scoreImpact: 5
  },
  insertAdjacentHTML: {
    title: 'insertAdjacentHTML() called',
    description: 'The extension calls insertAdjacentHTML(), which parses and inserts an HTML string. If the content is externally controlled, this enables cross-site scripting.',
    severity: 'medium',
    scoreImpact: 5
  },
  document_write: {
    title: 'document.write() called',
    description: 'The extension calls document.write(), which replaces the current page content. This is a legacy DOM injection technique that can be used for phishing-style content injection.',
    severity: 'medium',
    scoreImpact: 4
  },
  remote_script_injection: {
    title: 'Dynamic script tag created with remote source',
    description: 'The extension creates a <script> element and assigns a src attribute. If the src is a remote URL, this loads and executes arbitrary code from an external origin at runtime.',
    severity: 'high',
    scoreImpact: 12
  },
  cookie_read: {
    title: 'Cookie access via document.cookie',
    description: 'The extension reads document.cookie, which contains authentication tokens, session identifiers, and other sensitive values for the current page context.',
    severity: 'medium',
    scoreImpact: 5
  },
  clipboard_access: {
    title: 'Clipboard access via navigator.clipboard',
    description: 'The extension accesses the system clipboard, which may contain passwords, private keys, personal messages, or other sensitive content.',
    severity: 'medium',
    scoreImpact: 4
  },
  password_field_access: {
    title: 'Password field access detected',
    description: 'The extension uses a selector targeting input[type=password] fields. This can be used to harvest user credentials from any page the extension runs on.',
    severity: 'high',
    scoreImpact: 10
  },
  sendBeacon_exfiltration: {
    title: 'Data exfiltration via navigator.sendBeacon()',
    description: 'The extension uses navigator.sendBeacon() to send data to a remote endpoint. This method is designed to be fire-and-forget and is often used to exfiltrate data covertly.',
    severity: 'high',
    scoreImpact: 10
  },
  websocket_exfiltration: {
    title: 'WebSocket connection established',
    description: 'The extension creates a WebSocket connection. Persistent bi-directional communication channels enable real-time data exfiltration and remote command execution.',
    severity: 'medium',
    scoreImpact: 5
  },
  chrome_debugger_api: {
    title: 'chrome.debugger API used',
    description: 'The extension directly invokes the chrome.debugger API, which allows attaching a debugger to arbitrary tabs. This grants full visibility into and control of page execution.',
    severity: 'critical',
    scoreImpact: 18
  },
  chrome_proxy_api: {
    title: 'chrome.proxy API used',
    description: 'The extension invokes the chrome.proxy API to configure network proxies. This can redirect all browser traffic through an attacker-controlled server.',
    severity: 'high',
    scoreImpact: 12
  },
  chrome_cookies_api: {
    title: 'chrome.cookies API used',
    description: 'The extension directly calls the chrome.cookies API, allowing it to read, write, and delete cookies across all origins it has host permission for.',
    severity: 'high',
    scoreImpact: 10
  },
  chrome_management_api: {
    title: 'chrome.management API used',
    description: 'The extension invokes the chrome.management API. This allows managing (installing, disabling, or uninstalling) other extensions and apps in the browser.',
    severity: 'high',
    scoreImpact: 10
  },
  chrome_webrequest_api: {
    title: 'chrome.webRequest API used',
    description: 'The extension uses the chrome.webRequest API to intercept or modify network requests. While common in ad-blockers and security tools, it can also be used to monitor or tamper with traffic.',
    severity: 'medium',
    scoreImpact: 5
  },
  obfuscation_atob: {
    title: 'Base64 decoding (atob) detected',
    description: 'The extension calls atob() to decode Base64 strings. This is commonly used to hide payload strings from static analysis. Not inherently malicious, but notable in context.',
    severity: 'low',
    scoreImpact: 3
  },
  obfuscation_eval_pack: {
    title: 'Packed JavaScript detected (Dean Edwards-style)',
    description: 'The extension contains code matching the signature of a JavaScript packer (eval(function(p,a,c,k,e,...)). Packed code hides readable source and is a common obfuscation technique.',
    severity: 'high',
    scoreImpact: 12
  },
  obfuscation_hex_array: {
    title: 'Hex-encoded string array detected',
    description: 'The extension contains an array of hex-encoded strings, a pattern associated with obfuscators that replace readable identifiers and values with hex literals.',
    severity: 'low',
    scoreImpact: 4
  },
  message_eval_chain: {
    title: 'Message listener with eval() in the same file',
    description: 'The extension has a message listener (chrome.runtime.onMessage or onConnect) and calls eval() in the same file. This pattern is associated with extensions that execute arbitrary code received from remote sources or other extensions.',
    severity: 'critical',
    scoreImpact: 18
  }
};

/**
 * Converts a flat list of CodeFindings (potentially from multiple files and rules)
 * into a deduplicated list of RiskSignals and a total score impact.
 *
 * Deduplication: one signal per distinct rule. Multiple files triggering the same
 * rule appear as separate evidence entries on a single signal.
 */
export function aggregateCodeFindings(findings: CodeFinding[]): { signals: RiskSignal[]; score: number } {
  if (findings.length === 0) {
    return { signals: [], score: 0 };
  }

  const byRule = new Map<CodeFindingRule, CodeFinding[]>();
  for (const finding of findings) {
    const group = byRule.get(finding.rule);
    if (group !== undefined) {
      group.push(finding);
    } else {
      byRule.set(finding.rule, [finding]);
    }
  }

  const signals: RiskSignal[] = [];
  let totalScore = 0;

  for (const [rule, ruleFindings] of byRule.entries()) {
    const meta = SIGNAL_METADATA[rule];

    // Dedupe file paths: multiple matches in the same file → one file evidence entry.
    const uniqueFiles = [...new Set(ruleFindings.map((f) => f.file))];
    const evidence = uniqueFiles.map((filePath) => ({
      key: 'file',
      value: filePath
    }));

    // Include the first match's snippet for inline context.
    const firstFinding = ruleFindings[0];
    if (firstFinding !== undefined && firstFinding.snippet.length > 0) {
      evidence.push({ key: 'snippet', value: firstFinding.snippet });
    }

    signals.push({
      id: `code-scan-${rule}`,
      title: meta.title,
      severity: meta.severity,
      description: meta.description,
      evidence,
      scoreImpact: meta.scoreImpact
    });

    totalScore += meta.scoreImpact;
  }

  return { signals, score: totalScore };
}
