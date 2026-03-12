import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { detectPackageKind, extractManifestFromPackage } from '../src/archive';

function buildZipManifest(manifest: object): Uint8Array {
  return buildZipEntries({
    'manifest.json': manifest
  });
}

function buildZipEntries(entries: Record<string, object | string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([filename, value]) => [
        filename,
        strToU8(typeof value === 'string' ? value : JSON.stringify(value))
      ])
    )
  );
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

  it('resolves localized extension name from _locales messages', () => {
    const bytes = buildZipEntries({
      'manifest.json': {
        name: '__MSG_extName__',
        version: '2.0.0',
        manifest_version: 2,
        default_locale: 'en'
      },
      '_locales/en/messages.json': {
        extName: {
          message: 'Resolved From Locale'
        }
      }
    });

    const manifest = extractManifestFromPackage(bytes, 'zip') as { name: string };

    expect(manifest.name).toBe('Resolved From Locale');
  });

  it('supports localized names inside nested package roots', () => {
    const bytes = buildZipEntries({
      'addon/manifest.json': {
        name: '__MSG_app_name__',
        version: '3.0.0',
        manifest_version: 3,
        default_locale: 'en-US'
      },
      'addon/_locales/en_US/messages.json': {
        app_name: {
          message: 'Nested Locale Name'
        }
      }
    });

    const manifest = extractManifestFromPackage(bytes, 'zip') as { name: string };

    expect(manifest.name).toBe('Nested Locale Name');
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
