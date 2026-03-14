const PRIVATE_IPV4_RANGES = [
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
  { start: [127, 0, 0, 0], end: [127, 255, 255, 255] },
  { start: [169, 254, 0, 0], end: [169, 254, 255, 255] },
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] }
] as const;

const ALLOWED_SUBMISSION_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'clients2.google.com',
  'addons.mozilla.org',
  'apps.apple.com',
  'itunes.apple.com',
  'microsoftedge.microsoft.com',
  'edge.microsoft.com'
]);

export function isAllowedSubmissionHost(hostname: string): boolean {
  return ALLOWED_SUBMISSION_HOSTS.has(hostname.toLowerCase());
}

export function isSafariAppStoreHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'apps.apple.com' || normalized === 'itunes.apple.com';
}

function ipv4PartsToInt(parts: readonly number[]): number {
  const [a, b, c, d] = parts;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error('IPv4 conversion requires exactly 4 parts.');
  }

  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const target = parts as [number, number, number, number];
  const targetInt = ipv4PartsToInt(target);

  return PRIVATE_IPV4_RANGES.some((range) => {
    const start = ipv4PartsToInt(range.start);
    const end = ipv4PartsToInt(range.end);
    return targetInt >= start && targetInt <= end;
  });
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80');
}

export function validatePublicFetchUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'URL must be a valid absolute URL.' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are allowed for package retrieval.' };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    return { ok: false, reason: 'Localhost and local network hostnames are not allowed.' };
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return { ok: false, reason: 'Private or loopback IP targets are not allowed.' };
  }

  if (!isAllowedSubmissionHost(hostname)) {
    return {
      ok: false,
      reason: 'Unsupported URL domain. Use a Chrome Web Store, Edge Add-ons, or Firefox Add-ons URL, or upload a package file.'
    };
  }

  return { ok: true, url: parsedUrl };
}
