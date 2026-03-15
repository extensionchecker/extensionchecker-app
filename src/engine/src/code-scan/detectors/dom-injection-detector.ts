/**
 * Detects DOM injection patterns:
 *   - element.innerHTML = ...
 *   - element.outerHTML = ...
 *   - element.insertAdjacentHTML(...)
 *   - document.write(...)
 *
 * These sinks allow HTML injection, which is an XSS vector when the value
 * originates from network responses, extension messaging, or storage.
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const INNERHTML_RE = /\.innerHTML\s*=/g;
const OUTERHTML_RE = /\.outerHTML\s*=/g;
const INSERT_ADJACENT_HTML_RE = /\.insertAdjacentHTML\s*\(/g;
const DOCUMENT_WRITE_RE = /\bdocument\.write\s*\(/g;

export function detectDomInjection(path: string, content: string): CodeFinding[] {
  return [
    ...findMatches(content, INNERHTML_RE, path, 'innerHTML_assignment'),
    ...findMatches(content, OUTERHTML_RE, path, 'outerHTML_assignment'),
    ...findMatches(content, INSERT_ADJACENT_HTML_RE, path, 'insertAdjacentHTML'),
    ...findMatches(content, DOCUMENT_WRITE_RE, path, 'document_write')
  ];
}
