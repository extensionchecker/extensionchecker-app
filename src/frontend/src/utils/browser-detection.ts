import type { DetectedBrowser, SmartSubmissionKind } from '../types';
import { CHROME_EXTENSION_ID_REGEX, SAFARI_APP_STORE_ID_REGEX } from '../constants';

export function detectedBrowserFromUrl(url: URL): DetectedBrowser {
  const host = url.hostname.toLowerCase();

  if (host === 'chromewebstore.google.com' || host === 'chrome.google.com' || host === 'clients2.google.com') {
    return 'chrome';
  }

  if (host === 'addons.mozilla.org') {
    return 'firefox';
  }

  if (host === 'microsoftedge.microsoft.com' || host === 'edge.microsoft.com') {
    return 'edge';
  }

  if (host === 'addons.opera.com') {
    return 'opera';
  }

  if (host === 'apps.apple.com' || host === 'itunes.apple.com') {
    return 'safari';
  }

  return 'generic';
}

export function detectedBrowserFromId(value: string): DetectedBrowser {
  const trimmed = value.trim();

  if (/^chrome:/i.test(trimmed) || CHROME_EXTENSION_ID_REGEX.test(trimmed)) {
    return /^chrome:/i.test(trimmed) ? 'chrome' : 'chromium';
  }

  if (/^firefox:/i.test(trimmed)) {
    return 'firefox';
  }

  if (/^edge:/i.test(trimmed)) {
    return 'edge';
  }

  if (/^opera:/i.test(trimmed)) {
    return 'opera';
  }

  if (/^safari:/i.test(trimmed) || SAFARI_APP_STORE_ID_REGEX.test(trimmed)) {
    return 'safari';
  }

  return 'generic';
}

export function browserDetectionLabel(browser: DetectedBrowser, kind: Extract<SmartSubmissionKind, 'url' | 'id'>): string {
  if (browser === 'chrome') {
    return 'Chrome extension detected';
  }

  if (browser === 'chromium') {
    return 'Chrome or Edge extension ID detected';
  }

  if (browser === 'firefox') {
    return 'Firefox extension detected';
  }

  if (browser === 'edge') {
    return 'Edge extension detected';
  }

  if (browser === 'opera') {
    return 'Opera extension detected';
  }

  if (browser === 'safari') {
    return kind === 'url' ? 'Safari listing detected' : 'Safari extension detected';
  }

  return kind === 'url' ? 'Extension URL detected' : 'Extension ID detected';
}

export function browserDetectionIconSrc(browser: DetectedBrowser): string | null {
  if (browser === 'chrome') {
    return '/browser-icons/icon_chrome.png';
  }

  if (browser === 'chromium') {
    return null;
  }

  if (browser === 'firefox') {
    return '/browser-icons/icon_firefox.png';
  }

  if (browser === 'edge') {
    return '/browser-icons/icon_edge.png';
  }

  if (browser === 'opera') {
    return '/browser-icons/icon_opera.png';
  }

  if (browser === 'safari') {
    return '/browser-icons/icon_safari.png';
  }

  return null;
}

export function unsupportedBrowserMessage(browser: DetectedBrowser, kind: Extract<SmartSubmissionKind, 'url' | 'id'>): string | null {
  if (browser === 'safari') {
    return kind === 'url'
      ? 'Safari App Store URLs are not supported. Upload the extension instead.'
      : 'Safari extensions are not supported by ID. Upload the extension instead.';
  }

  if (browser === 'opera' && kind === 'url') {
    return null;
  }

  return null;
}

export function isLikelySafariExtensionId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^safari:/i.test(trimmed)) {
    return true;
  }

  return SAFARI_APP_STORE_ID_REGEX.test(trimmed);
}

export function looksLikeValidChromeId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^chrome:/i.test(trimmed)) {
    return CHROME_EXTENSION_ID_REGEX.test(trimmed.replace(/^chrome:/i, ''));
  }

  return CHROME_EXTENSION_ID_REGEX.test(trimmed);
}

export function isSafariStoreInputUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'apps.apple.com' || host === 'itunes.apple.com';
  } catch {
    return false;
  }
}
