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

function findManifestContent(unzippedFiles: Record<string, Uint8Array>): string {
  const entries = Object.entries(unzippedFiles);

  const exactEntry = entries.find(([name]) => name === 'manifest.json');
  if (exactEntry) {
    return strFromU8(exactEntry[1]);
  }

  const nestedEntry = entries.find(([name]) => name.endsWith('/manifest.json'));
  if (!nestedEntry) {
    throw new Error('manifest.json was not found in the package.');
  }

  return strFromU8(nestedEntry[1]);
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

  let manifestRaw: string;
  try {
    const unzipped = unzipSync(zipBytes);
    manifestRaw = findManifestContent(unzipped);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown archive parsing error.';
    throw new Error(`Failed to parse package archive: ${message}`);
  }

  try {
    return JSON.parse(manifestRaw);
  } catch {
    throw new Error('manifest.json is not valid JSON.');
  }
}
