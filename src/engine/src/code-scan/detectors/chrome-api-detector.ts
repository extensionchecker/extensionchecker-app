/**
 * Detects usage of high-risk Chrome extension APIs:
 *   - chrome.debugger   (attach debugger to arbitrary tabs — powerful interception)
 *   - chrome.proxy      (redirect all network traffic)
 *   - chrome.cookies    (read/write all cookies across origins)
 *   - chrome.management (install, disable, or uninstall other extensions)
 *   - chrome.webRequest (intercept and modify network requests)
 *
 * Finding these APIs in source code is an additional evidence signal on top of
 * the manifest permission declarations. Actual invocation is stronger evidence
 * of intent than declaration alone.
 */
import type { CodeFinding } from '../types';
import { findMatches } from './match-helpers';

const CHROME_DEBUGGER_RE = /\bchrome\.debugger\b/g;
const CHROME_PROXY_RE = /\bchrome\.proxy\b/g;
const CHROME_COOKIES_RE = /\bchrome\.cookies\b/g;
const CHROME_MANAGEMENT_RE = /\bchrome\.management\b/g;
const CHROME_WEBREQUEST_RE = /\bchrome\.webRequest\b/g;

export function detectChromeApis(path: string, content: string): CodeFinding[] {
  return [
    ...findMatches(content, CHROME_DEBUGGER_RE, path, 'chrome_debugger_api'),
    ...findMatches(content, CHROME_PROXY_RE, path, 'chrome_proxy_api'),
    ...findMatches(content, CHROME_COOKIES_RE, path, 'chrome_cookies_api'),
    ...findMatches(content, CHROME_MANAGEMENT_RE, path, 'chrome_management_api'),
    ...findMatches(content, CHROME_WEBREQUEST_RE, path, 'chrome_webrequest_api')
  ];
}
