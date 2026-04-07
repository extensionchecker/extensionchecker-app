import type { AnalysisReport, RiskSignal } from '@extensionchecker/shared';
import type { RGB } from './types';

/** Returns true when host exactly matches domain or is a subdomain of it. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function getStoreLabel(report: AnalysisReport): string {
  if (report.source.type === 'file') {
    return 'Uploaded package';
  }

  const value = report.source.value;

  if (report.source.type === 'id') {
    if (value.startsWith('chrome:') || /^[a-p]{32}$/.test(value)) {
      return 'Chrome Web Store';
    }

    if (value.startsWith('firefox:')) {
      return 'Firefox Add-ons';
    }

    return 'Extension ID';
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (hostMatches(host, 'chromewebstore.google.com') || hostMatches(host, 'chrome.google.com') || hostMatches(host, 'clients2.google.com')) {
      return 'Chrome Web Store';
    }

    if (hostMatches(host, 'addons.mozilla.org')) {
      return 'Firefox Add-ons';
    }

    if (hostMatches(host, 'apps.apple.com') || hostMatches(host, 'safari-extensions.apple.com')) {
      return 'Safari Extensions';
    }
  } catch {
    return 'Unknown store';
  }

  return 'Unknown store';
}

export function severityOrder(signal: RiskSignal): number {
  switch (signal.severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 3;
  }
}

/** RAGB colour for a capability/risk score (low = safe). */
export function scoreColor(score: number): RGB {
  if (score <= 25) {
    return [44, 182, 87]; // green
  }

  if (score <= 50) {
    return [235, 172, 71]; // yellow
  }

  if (score <= 75) {
    return [249, 115, 22]; // orange
  }

  return [239, 68, 68]; // red
}

/**
 * Inverted colour scale for trust scores - mirrors trustScoreColor() from
 * formatting.ts but returns RGB tuples for jsPDF.
 * High trust (near 100) = green; low trust (near 0) = red.
 */
export function trustScoreColorRgb(score: number): RGB {
  if (score <= 20) {
    return [239, 68, 68]; // red - low trust
  }

  if (score <= 40) {
    return [249, 115, 22]; // orange
  }

  if (score <= 60) {
    return [234, 179, 8]; // yellow
  }

  if (score <= 80) {
    return [132, 204, 22]; // lime green
  }

  return [34, 197, 94]; // green - high trust
}

export function statusColor(status: import('../../types').PhaseStatus): { fill: RGB; text: RGB } {
  if (status === 'complete')    return { fill: [214, 243, 222], text: [26, 110, 51]  }; // green
  if (status === 'cached')     return { fill: [219, 234, 254], text: [37, 99, 235]   }; // blue
  if (status === 'partial')    return { fill: [255, 234, 194], text: [132, 85, 21]  }; // amber
  if (status === 'unavailable') return { fill: [255, 232, 232], text: [141, 36, 36] }; // red
  return { fill: [241, 245, 249], text: [71, 85, 105] };                               // grey - not-available
}
