import type { AnalysisReport } from '@extensionchecker/shared';
import type { DetectedBrowser } from '../types';
import { browserDetectionIconSrc } from './browser-detection';

/** Returns true when host exactly matches domain or is a subdomain of it. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function sourceStoreBrowser(report: AnalysisReport): DetectedBrowser | null {
  if (report.source.type === 'file') {
    return null;
  }

  const value = report.source.value;

  if (report.source.type === 'id') {
    if (value.startsWith('chrome:')) {
      return 'chrome';
    }

    if (/^[a-p]{32}$/.test(value)) {
      return 'chromium';
    }

    if (value.startsWith('firefox:')) {
      return 'firefox';
    }

    if (value.startsWith('edge:')) {
      return 'edge';
    }

    if (value.startsWith('opera:')) {
      return 'opera';
    }

    if (value.startsWith('safari:')) {
      return 'safari';
    }

    return 'generic';
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (hostMatches(host, 'chromewebstore.google.com') || hostMatches(host, 'chrome.google.com') || hostMatches(host, 'clients2.google.com')) {
      return 'chrome';
    }

    if (hostMatches(host, 'addons.mozilla.org')) {
      return 'firefox';
    }

    if (hostMatches(host, 'microsoftedge.microsoft.com') || hostMatches(host, 'edge.microsoft.com')) {
      return 'edge';
    }

    if (hostMatches(host, 'addons.opera.com')) {
      return 'opera';
    }

    if (hostMatches(host, 'apps.apple.com') || hostMatches(host, 'safari-extensions.apple.com')) {
      return 'safari';
    }
  } catch {
    return 'generic';
  }

  return 'generic';
}

export function sourceStoreLabel(report: AnalysisReport): string {
  if (report.source.type === 'file') {
    return 'Uploaded package';
  }

  const browser = sourceStoreBrowser(report);

  if (browser === 'chrome') {
    return 'Chrome Web Store';
  }

  if (browser === 'chromium') {
    return 'Chrome or Edge Extension';
  }

  if (browser === 'firefox') {
    return 'Firefox Add-ons';
  }

  if (browser === 'edge') {
    return 'Edge Add-ons';
  }

  if (browser === 'opera') {
    return 'Opera Add-ons';
  }

  if (browser === 'safari') {
    return 'Safari Extensions';
  }

  return report.source.type === 'id' ? 'Extension ID' : 'Unknown store';
}

export function sourceListingUrl(report: AnalysisReport): string | null {
  if (report.source.type === 'url') {
    try {
      const parsed = new URL(report.source.value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  if (report.source.type === 'id') {
    const raw = report.source.value.trim();

    if (/^[a-p]{32}$/.test(raw)) {
      return `https://chromewebstore.google.com/detail/${raw}`;
    }

    if (raw.startsWith('chrome:')) {
      const id = raw.replace(/^chrome:/, '');
      if (/^[a-p]{32}$/.test(id)) {
        return `https://chromewebstore.google.com/detail/${id}`;
      }
      return null;
    }

    if (raw.startsWith('firefox:')) {
      const addOnId = raw.replace(/^firefox:/, '');
      return addOnId ? `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(addOnId)}/` : null;
    }

    if (raw.startsWith('edge:')) {
      const id = raw.replace(/^edge:/, '');
      if (/^[a-p]{32}$/.test(id)) {
        return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
      }
      return null;
    }

    if (raw.startsWith('opera:')) {
      const slug = raw.replace(/^opera:/, '').trim();
      return slug ? `https://addons.opera.com/en/extensions/details/${encodeURIComponent(slug)}/` : null;
    }
  }

  return null;
}

export function sourceStoreBadgeIconSrc(report: AnalysisReport): string | null {
  const browser = sourceStoreBrowser(report);
  return browser ? browserDetectionIconSrc(browser) : null;
}
