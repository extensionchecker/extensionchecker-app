const MAX_CLIENT_KEY_LENGTH = 64;
const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^[0-9a-f:]+$/i;

export function parseRequestOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function isOriginAllowed(origin: string | null, requestUrl: URL, allowedOrigins: Set<string>): boolean {
  if (!origin) {
    return true;
  }

  return origin === requestUrl.origin || allowedOrigins.has(origin);
}

function isValidIpv4(address: string): boolean {
  if (!IPV4_REGEX.test(address)) {
    return false;
  }

  const parts = address.split('.').map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function isValidIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.length < 2 || normalized.length > MAX_CLIENT_KEY_LENGTH) {
    return false;
  }

  if (!normalized.includes(':')) {
    return false;
  }

  if (!IPV6_REGEX.test(normalized.replaceAll('::', ':'))) {
    return false;
  }

  return true;
}

function normalizeClientAddress(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().replace(/^\[(.*)\]$/, '$1');
  if (trimmed.length < 2 || trimmed.length > MAX_CLIENT_KEY_LENGTH) {
    return null;
  }

  if (isValidIpv4(trimmed) || isValidIpv6(trimmed)) {
    return trimmed;
  }

  return null;
}

export function resolveClientKey(headers: Headers): string {
  const cfIp = normalizeClientAddress(headers.get('cf-connecting-ip'));
  if (cfIp) {
    return cfIp;
  }

  const xForwardedFor = headers.get('x-forwarded-for')?.split(',')[0];
  const forwardedIp = normalizeClientAddress(xForwardedFor);
  if (forwardedIp) {
    return forwardedIp;
  }

  return 'unknown';
}

export function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  return contentType.toLowerCase().startsWith('application/json');
}

export function isMultipartContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  return contentType.toLowerCase().startsWith('multipart/form-data');
}

/**
 * Compares two strings in constant time to prevent timing side-channel attacks.
 * Pads both inputs to the same byte length before XOR-comparing every byte so
 * the loop runtime does not depend on where the first differing character is.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);

  // Allocate padded buffers of equal length so the loop is unconditional.
  const paddedA = new Uint8Array(maxLen);
  const paddedB = new Uint8Array(maxLen);
  paddedA.set(bufA);
  paddedB.set(bufB);

  // Accumulate differences across all bytes. A non-zero result means not equal.
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (paddedA[i] ?? 0) ^ (paddedB[i] ?? 0);
  }

  return diff === 0;
}

export function hasValidApiAccessToken(headers: Headers, token: string | null): boolean {
  if (!token) {
    return true;
  }

  const presented = headers.get('x-extensionchecker-token')?.trim() ?? '';
  return presented.length > 0 && timingSafeEqual(presented, token);
}
