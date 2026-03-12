import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { detectPackageKind, extractManifestFromPackage } from '../src/archive';

function buildZipManifest(manifest: object): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest))
  });
}

describe('archive helpers', () => {
  it('extracts manifest from zip package', () => {
    const bytes = buildZipManifest({
      name: 'Zip Extension',
      version: '1.0.0',
      manifest_version: 3
    });

    const manifest = extractManifestFromPackage(bytes, 'zip') as { name: string };

    expect(manifest.name).toBe('Zip Extension');
  });

  it('extracts manifest from CRX package', () => {
    const zipBytes = buildZipManifest({
      name: 'CRX Extension',
      version: '1.0.0',
      manifest_version: 3
    });

    const header = new Uint8Array(12);
    header.set(strToU8('Cr24'), 0);
    const view = new DataView(header.buffer);
    view.setUint32(4, 3, true);
    view.setUint32(8, 0, true);

    const crxBytes = new Uint8Array(header.length + zipBytes.length);
    crxBytes.set(header, 0);
    crxBytes.set(zipBytes, header.length);

    const manifest = extractManifestFromPackage(crxBytes, 'crx') as { name: string };

    expect(manifest.name).toBe('CRX Extension');
  });

  it('detects package kind from URL and content type', () => {
    expect(detectPackageKind(new URL('https://example.com/a.crx'))).toBe('crx');
    expect(detectPackageKind(new URL('https://example.com/a.any'), 'application/x-xpinstall')).toBe('xpi');
    expect(detectPackageKind(new URL('https://example.com/a.any'), null)).toBe('zip');
  });
});
