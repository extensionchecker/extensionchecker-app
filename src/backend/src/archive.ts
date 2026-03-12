import { strFromU8, unzipSync } from 'fflate';

export type PackageKind = 'zip' | 'xpi' | 'crx';

function toU8(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function extractCrxZipPayload(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12) {
    throw new Error('Invalid CRX: file is too small.');
  }

  const magic = strFromU8(bytes.slice(0, 4));
  if (magic !== 'Cr24') {
    throw new Error('Invalid CRX: missing CRX magic header.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);

  let zipOffset: number;
  if (version === 2) {
    const publicKeyLength = view.getUint32(8, true);
    const signatureLength = view.getUint32(12, true);
    zipOffset = 16 + publicKeyLength + signatureLength;
  } else if (version === 3) {
    const headerLength = view.getUint32(8, true);
    zipOffset = 12 + headerLength;
  } else {
    throw new Error(`Unsupported CRX version: ${version}.`);
  }

  if (zipOffset >= bytes.length) {
    throw new Error('Invalid CRX: ZIP payload offset is out of bounds.');
  }

  return bytes.slice(zipOffset);
}

function findManifestEntry(unzippedFiles: Record<string, Uint8Array>): { path: string; bytes: Uint8Array } {
  const entries = Object.entries(unzippedFiles);

  const exactEntry = entries.find(([name]) => name === 'manifest.json');
  if (exactEntry) {
    return {
      path: exactEntry[0],
      bytes: exactEntry[1]
    };
  }

  const nestedEntry = entries.find(([name]) => name.endsWith('/manifest.json'));
  if (!nestedEntry) {
    throw new Error('manifest.json was not found in the package.');
  }

  return {
    path: nestedEntry[0],
    bytes: nestedEntry[1]
  };
}

function parseJsonObject(raw: string, fileLabel: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${fileLabel} is not valid JSON.`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fileLabel} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function trimTrailingSlashes(path: string): string {
  return path.replace(/\/+$/, '');
}

function localePathVariants(defaultLocale?: string): string[] {
  const normalized = defaultLocale?.trim();
  const locales = [normalized, normalized?.replace(/-/g, '_'), normalized?.replace(/_/g, '-') , 'en', 'en_US', 'en-US']
    .filter((value): value is string => Boolean(value && value.length > 0));

  return [...new Set(locales)];
}

function parseLocalizedMessageKey(value: string): string | null {
  const trimmed = value.trim();
  const match = /^__MSG_([A-Za-z0-9_.@-]+)__$/.exec(trimmed);
  return match?.[1] ?? null;
}

function resolveLocalizedManifestValue(
  manifestValue: unknown,
  unzippedFiles: Record<string, Uint8Array>,
  manifestPath: string,
  defaultLocale?: string
): string | null {
  if (typeof manifestValue !== 'string') {
    return null;
  }

  const messageKey = parseLocalizedMessageKey(manifestValue);
  if (!messageKey) {
    return null;
  }

  const slashIndex = manifestPath.lastIndexOf('/');
  const packageRoot = slashIndex >= 0 ? trimTrailingSlashes(manifestPath.slice(0, slashIndex)) : '';

  for (const locale of localePathVariants(defaultLocale)) {
    const localePath = packageRoot.length > 0
      ? `${packageRoot}/_locales/${locale}/messages.json`
      : `_locales/${locale}/messages.json`;

    const localeBytes = unzippedFiles[localePath];
    if (!localeBytes) {
      continue;
    }

    let parsedMessages: Record<string, unknown>;
    try {
      parsedMessages = parseJsonObject(strFromU8(localeBytes), `Locale file "${localePath}"`);
    } catch {
      continue;
    }

    const messageEntry = parsedMessages[messageKey];
    if (!messageEntry || typeof messageEntry !== 'object' || Array.isArray(messageEntry)) {
      continue;
    }

    const translated = (messageEntry as { message?: unknown }).message;
    if (typeof translated === 'string' && translated.trim().length > 0) {
      return translated.trim();
    }
  }

  return null;
}

export function detectPackageKind(url: URL, contentTypeHeader?: string | null): PackageKind {
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.crx')) {
    return 'crx';
  }

  if (path.endsWith('.xpi')) {
    return 'xpi';
  }

  if (path.endsWith('.zip')) {
    return 'zip';
  }

  const contentType = (contentTypeHeader ?? '').toLowerCase();
  if (contentType.includes('x-chrome-extension')) {
    return 'crx';
  }

  if (contentType.includes('x-xpinstall')) {
    return 'xpi';
  }

  return 'zip';
}

export function extractManifestFromPackage(bytes: ArrayBuffer | Uint8Array, packageKind: PackageKind): unknown {
  const inputBytes = toU8(bytes);
  const zipBytes = packageKind === 'crx' ? extractCrxZipPayload(inputBytes) : inputBytes;

  let unzipped: Record<string, Uint8Array>;
  let manifestPath: string;
  let manifestRaw: string;
  try {
    unzipped = unzipSync(zipBytes);
    const manifestEntry = findManifestEntry(unzipped);
    manifestPath = manifestEntry.path;
    manifestRaw = strFromU8(manifestEntry.bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown archive parsing error.';
    throw new Error(`Failed to parse package archive: ${message}`);
  }

  const manifest = parseJsonObject(manifestRaw, 'manifest.json');
  const defaultLocale = typeof manifest.default_locale === 'string' ? manifest.default_locale : undefined;
  const resolvedName = resolveLocalizedManifestValue(manifest.name, unzipped, manifestPath, defaultLocale);
  if (resolvedName) {
    manifest.name = resolvedName;
  }

  return manifest;
}
