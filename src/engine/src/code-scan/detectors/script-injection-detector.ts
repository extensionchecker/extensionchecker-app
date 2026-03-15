/**
 * Detects dynamic script injection:
 *   - document.createElement("script") with a src assignment
 *
 * Malicious extensions use this pattern to load remote JavaScript at runtime,
 * bypassing CSP where misconfigured and evading static analysis of bundle files.
 *
 * Strategy: flag files that contain both createElement("script") AND a .src
 * assignment (case-insensitive). File-level co-occurrence is a reliable signal
 * without requiring full AST taint tracking.
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const CREATE_SCRIPT_RE = /\bcreateElement\s*\(\s*["'`]script["'`]\s*\)/g;
const SCRIPT_SRC_ASSIGN_RE = /\bsrc\s*=\s*(?!["'`](?:chrome-extension:|moz-extension:|\/\/)['"`])/g;

export function detectScriptInjection(path: string, content: string): CodeFinding[] {
  const hasCreateScript = CREATE_SCRIPT_RE.test(content);
  CREATE_SCRIPT_RE.lastIndex = 0;

  if (!hasCreateScript) {
    return [];
  }

  const hasSrcAssign = SCRIPT_SRC_ASSIGN_RE.test(content);
  SCRIPT_SRC_ASSIGN_RE.lastIndex = 0;

  if (!hasSrcAssign) {
    return [];
  }

  return findMatches(content, CREATE_SCRIPT_RE, path, 'remote_script_injection');
}
