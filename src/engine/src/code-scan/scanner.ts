/**
 * Orchestrates all detector functions over a single JS file.
 *
 * Returns the union of findings from every detector. Callers (backend)
 * aggregate findings across all files before passing to signals.ts.
 */
import type { CodeFinding, JsFileEntry } from './types';
import { detectEval } from './detectors/eval-detector';
import { detectDomInjection } from './detectors/dom-injection-detector';
import { detectScriptInjection } from './detectors/script-injection-detector';
import { detectDataExfiltration } from './detectors/data-exfiltration-detector';
import { detectChromeApis } from './detectors/chrome-api-detector';
import { detectObfuscation } from './detectors/obfuscation-detector';
import { detectMessagingAbuse } from './detectors/messaging-abuse-detector';

/**
 * Runs all lite detectors against a single JS file and returns the combined findings.
 * This is a pure function: same input always produces same output.
 */
export function scanJsFile(file: JsFileEntry): CodeFinding[] {
  const { path, content } = file;
  return [
    ...detectEval(path, content),
    ...detectDomInjection(path, content),
    ...detectScriptInjection(path, content),
    ...detectDataExfiltration(path, content),
    ...detectChromeApis(path, content),
    ...detectObfuscation(path, content),
    ...detectMessagingAbuse(path, content)
  ];
}
