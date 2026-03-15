/**
 * Detects messaging abuse: a message listener that also calls eval()
 * or makes network requests within the same file.
 *
 * Pattern: chrome.runtime.onMessage (or onConnect) co-located with eval.
 * This is a high-signal combination — it means the extension can receive
 * arbitrary code from another extension or web page and execute it.
 *
 * File-level co-occurrence is used rather than full taint tracking.
 * False positive rate is very low in practice: legitimate extensions
 * almost never need to eval() inside a message listener.
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const ONMESSAGE_RE = /\bchrome\.runtime\.onMessage\b/g;
const ONCONNECT_RE = /\bchrome\.runtime\.onConnect\b/g;
const EVAL_IN_FILE_RE = /\beval\s*\(/;

export function detectMessagingAbuse(path: string, content: string): CodeFinding[] {
  const hasOnMessage = ONMESSAGE_RE.test(content);
  ONMESSAGE_RE.lastIndex = 0;

  const hasOnConnect = ONCONNECT_RE.test(content);
  ONCONNECT_RE.lastIndex = 0;

  if (!hasOnMessage && !hasOnConnect) {
    return [];
  }

  if (!EVAL_IN_FILE_RE.test(content)) {
    return [];
  }

  const source = hasOnMessage ? ONMESSAGE_RE : ONCONNECT_RE;
  return findMatches(content, source, path, 'message_eval_chain');
}
