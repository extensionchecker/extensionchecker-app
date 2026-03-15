/**
 * Detects data collection and exfiltration patterns:
 *   - document.cookie access (cookie harvesting)
 *   - navigator.clipboard access
 *   - input[type=password] field selectors (credential harvesting)
 *   - navigator.sendBeacon() (covert data exfiltration)
 *   - new WebSocket() (persistent exfiltration channel)
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const COOKIE_READ_RE = /\bdocument\.cookie\b/g;
const CLIPBOARD_RE = /\bnavigator\.clipboard\b/g;
const PASSWORD_FIELD_RE = /\binput\s*\[\s*(?:type\s*=\s*["'`]password["'`]|["'`]type\s*=\s*password["'`])\s*\]/g;
const SEND_BEACON_RE = /\bnavigator\.sendBeacon\s*\(/g;
const WEBSOCKET_RE = /\bnew\s+WebSocket\s*\(/g;

export function detectDataExfiltration(path: string, content: string): CodeFinding[] {
  return [
    ...findMatches(content, COOKIE_READ_RE, path, 'cookie_read'),
    ...findMatches(content, CLIPBOARD_RE, path, 'clipboard_access'),
    ...findMatches(content, PASSWORD_FIELD_RE, path, 'password_field_access'),
    ...findMatches(content, SEND_BEACON_RE, path, 'sendBeacon_exfiltration'),
    ...findMatches(content, WEBSOCKET_RE, path, 'websocket_exfiltration')
  ];
}
