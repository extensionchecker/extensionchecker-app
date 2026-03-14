import type { AnalysisReport, RiskSignal } from '@extensionchecker/shared';
import type { RGB } from './types';

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

    if (host.includes('chromewebstore.google.com') || host.includes('chrome.google.com') || host.includes('clients2.google.com')) {
      return 'Chrome Web Store';
    }

    if (host.includes('addons.mozilla.org')) {
      return 'Firefox Add-ons';
    }

    if (host.includes('safari') || host.includes('apple.com')) {
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

export function scoreColor(score: number): RGB {
  if (score <= 25) {
    return [44, 182, 87];
  }

  if (score <= 50) {
    return [235, 172, 71];
  }

  return [229, 87, 87];
}

export function verdictLabel(report: AnalysisReport): string {
  if (report.score.severity === 'critical') {
    return 'High Danger';
  }

  if (report.score.severity === 'high') {
    return 'Dangerous';
  }

  if (report.score.severity === 'medium') {
    return 'Use Caution';
  }

  return report.riskSignals.length === 0 ? 'Likely Low Risk' : 'Low Risk (Review)';
}

export function statusColor(status: 'Complete' | 'Not Available'): { fill: RGB; text: RGB } {
  if (status === 'Complete') {
    return {
      fill: [214, 243, 222],
      text: [26, 110, 51]
    };
  }

  return {
    fill: [255, 234, 194],
    text: [132, 85, 21]
  };
}
