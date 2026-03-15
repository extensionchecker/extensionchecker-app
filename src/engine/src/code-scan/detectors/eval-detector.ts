/**
 * Detects dynamic code execution patterns:
 *   - eval(...)
 *   - new Function(...)
 *   - setTimeout("string", ...)
 *   - setInterval("string", ...)
 *
 * Dynamic code execution is a primary mechanism for loading obfuscated or
 * remotely-fetched payloads at runtime, bypassing static analysis.
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const EVAL_RE = /\beval\s*\(/g;
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/g;
const SETTIMEOUT_STRING_RE = /\bsetTimeout\s*\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*,/g;
const SETINTERVAL_STRING_RE = /\bsetInterval\s*\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*,/g;

export function detectEval(path: string, content: string): CodeFinding[] {
  return [
    ...findMatches(content, EVAL_RE, path, 'eval_usage'),
    ...findMatches(content, NEW_FUNCTION_RE, path, 'dynamic_function'),
    ...findMatches(content, SETTIMEOUT_STRING_RE, path, 'setTimeout_string'),
    ...findMatches(content, SETINTERVAL_STRING_RE, path, 'setInterval_string')
  ];
}
