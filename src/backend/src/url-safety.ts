const PRIVATE_IPV4_RANGES = [
  { start: [0, 0, 0, 0], end: [0, 255, 255, 255] },
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
  { start: [100, 64, 0, 0], end: [100, 127, 255, 255] },
  { start: [127, 0, 0, 0], end: [127, 255, 255, 255] },
  { start: [169, 254, 0, 0], end: [169, 254, 255, 255] },
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
  { start: [192, 0, 0, 0], end: [192, 0, 0, 255] },
  { start: [192, 0, 2, 0], end: [192, 0, 2, 255] },
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
  { start: [198, 18, 0, 0], end: [198, 19, 255, 255] },
  { start: [198, 51, 100, 0], end: [198, 51, 100, 255] },
  { start: [203, 0, 113, 0], end: [203, 0, 113, 255] },
  { start: [240, 0, 0, 0], end: [255, 255, 255, 255] }
] as const;

const ALLOWED_SUBMISSION_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'clients2.google.com',
  'addons.mozilla.org',
  'addons.opera.com',
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

export function isOperaAddonsHost(hostname: string): boolean {
  return hostname.toLowerCase() === 'addons.opera.com';
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
  return (
    normalized === '::1' ||
    // Unique-local (ULA) and link-local ranges
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x / ::ffff:0:0/96).
    // These resolve to IPv4 addresses and could bypass private-IP checks
    // if only the IPv4 representation is tested.
    normalized.startsWith('::ffff')
  );
}

export function validatePublicFetchUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Enter a valid URL.' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are supported.' };
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
      reason: 'Unsupported URL. Only browser extension store URLs are supported, or upload the extension.'
    };
  }

  return { ok: true, url: parsedUrl };
}

/**
 * Validates the final URL reached after an HTTP redirect chain.
 *
 * Unlike {@link validatePublicFetchUrl} this does NOT apply the extension-store
 * allowlist or a protocol restriction — legitimate store downloads can redirect
 * to first-party CDN hosts (including over plain HTTP) outside the allowlist.
 * For example, Microsoft's Edge extension CDN redirects to HTTP CDN endpoints.
 *
 * This function gates only on the properties that enable SSRF: localhost/local
 * hostnames and private or loopback IP addresses (including IPv4-mapped IPv6).
 * Protocol-level interception risk is accepted because the authoritative store
 * URL is already fetched over HTTPS, and CDN HTTP redirects are outside this
 * tool's threat model.
 *
 * Returns a reason string when the destination is unsafe, or null when safe.
 */
export function validateRedirectDestination(finalUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return 'Redirect destination is not a valid URL.';
  }

  // Only http: and https: are expected; reject anything else (e.g. file:, data:)
  // that could be used to access local resources.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Redirect destination uses an unsupported protocol.';
  }

  // WHATWG URL includes brackets for IPv6 hosts (e.g. "[::1]").  Strip them
  // before running private-IP checks so the functions receive a bare address.
  const rawHostname = parsed.hostname.toLowerCase();
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
    ? rawHostname.slice(1, -1)
    : rawHostname;

  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    return 'Redirect destination resolves to a local hostname.';
  }

  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    return 'Redirect destination resolves to a private or loopback address.';
  }

  return null;
}
