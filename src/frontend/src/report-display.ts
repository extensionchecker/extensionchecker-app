import type { AnalysisReport } from '@extensionchecker/shared';

const UNRESOLVED_LOCALIZED_NAME_PATTERN = /^__MSG_[A-Za-z0-9_.@-]+__$/;
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

function tryDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeHumanLabel(raw: string): string | null {
  const decoded = tryDecodeUriComponent(raw.trim());
  const withoutExtension = decoded.replace(/\.(zip|crx|xpi)$/i, '');
  const withoutPrefix = withoutExtension.replace(/^[._\-\s]+/, '').replace(/[._\-\s]+$/, '');
  if (!withoutPrefix) {
    return null;
  }

  const normalized = withoutPrefix
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[+_]+/g, ' ')
    .replace(/-/g, ' ')
    .replace(/[@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  if (CHROME_EXTENSION_ID_PATTERN.test(normalized)) {
    return null;
  }

  return normalized
    .split(' ')
    .map((word) => (word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word))
    .join(' ');
}

function looksUnresolvedLocalizedName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.includes('__MSG_') || UNRESOLVED_LOCALIZED_NAME_PATTERN.test(trimmed);
}

function fallbackNameFromUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (host.includes('chromewebstore.google.com') || host.includes('chrome.google.com')) {
    const detailIndex = segments.findIndex((segment) => segment === 'detail');
    if (detailIndex >= 0 && segments[detailIndex + 1]) {
      return normalizeHumanLabel(segments[detailIndex + 1] ?? '');
    }
  }

  if (host.includes('addons.mozilla.org')) {
    const addonIndex = segments.findIndex((segment) => segment === 'addon');
    if (addonIndex >= 0 && segments[addonIndex + 1]) {
      return normalizeHumanLabel(segments[addonIndex + 1] ?? '');
    }
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment) {
    return normalizeHumanLabel(lastSegment);
  }

  return null;
}

function fallbackNameFromSourceId(rawSourceId: string): string | null {
  const sourceId = rawSourceId.trim();
  if (!sourceId) {
    return null;
  }

  if (sourceId.startsWith('chrome:')) {
    const id = sourceId.slice('chrome:'.length).trim();
    if (CHROME_EXTENSION_ID_PATTERN.test(id)) {
      return `Chrome Extension (${id.slice(0, 8)}...)`;
    }
    return normalizeHumanLabel(id);
  }

  if (sourceId.startsWith('firefox:')) {
    return normalizeHumanLabel(sourceId.slice('firefox:'.length).trim());
  }

  if (sourceId.startsWith('safari:')) {
    return normalizeHumanLabel(sourceId.slice('safari:'.length).trim());
  }

  if (CHROME_EXTENSION_ID_PATTERN.test(sourceId)) {
    return `Chrome Extension (${sourceId.slice(0, 8)}...)`;
  }

  return normalizeHumanLabel(sourceId);
}

function fallbackNameFromSource(report: AnalysisReport): string | null {
  if (report.source.type === 'url') {
    return fallbackNameFromUrl(report.source.value);
  }

  if (report.source.type === 'id') {
    return fallbackNameFromSourceId(report.source.value);
  }

  if (report.source.type === 'file') {
    return normalizeHumanLabel(report.source.filename);
  }

  return null;
}

export function resolveExtensionDisplayName(report: AnalysisReport): string {
  const manifestName = report.metadata.name.trim();
  if (manifestName && !looksUnresolvedLocalizedName(manifestName)) {
    return manifestName;
  }

  const sourceFallback = fallbackNameFromSource(report);
  if (sourceFallback) {
    return sourceFallback;
  }

  return 'Extension name unavailable';
}

