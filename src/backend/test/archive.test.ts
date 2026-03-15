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

/**
 * Builds a minimal well-formed ZIP containing a single stored (uncompressed) entry.
 * Used to craft adversarial filenames that zipSync would reject or sanitize.
 */
function buildZipWithFilename(filename: string, content: string): Uint8Array {
  const enc = new TextEncoder();
  const fileData = enc.encode(content);
  const filenameBytes = enc.encode(filename);
  const fnLen = filenameBytes.length;
  const dataLen = fileData.length;

  // Local file header (30 + fnLen bytes) + data
  const localHeader = new Uint8Array(30 + fnLen + dataLen);
  const lhView = new DataView(localHeader.buffer);
  lhView.setUint32(0, 0x04034b50, false);   // signature (big-endian for readability, but ZIP is LE)
  // Redo as LE
  lhView.setUint32(0, 0x04034b50 >>> 0, true);  // PK\x03\x04 - actually we write bytes directly
  // Let's just use a simple approach: write the bytes manually
  const lh = new Uint8Array(30 + fnLen + dataLen);
  // PK local file header signature
  lh[0] = 0x50; lh[1] = 0x4b; lh[2] = 0x03; lh[3] = 0x04;
  // version needed: 2.0
  lh[4] = 20; lh[5] = 0;
  // general purpose bit flag: 0
  lh[6] = 0; lh[7] = 0;
  // compression method: 0 (stored)
  lh[8] = 0; lh[9] = 0;
  // last mod time/date: zeros
  lh[10] = 0; lh[11] = 0; lh[12] = 0; lh[13] = 0;
  // CRC-32: 0 (not validated for our purposes)
  lh[14] = 0; lh[15] = 0; lh[16] = 0; lh[17] = 0;
  // compressed size (LE)
  lh[18] = dataLen & 0xff; lh[19] = (dataLen >> 8) & 0xff; lh[20] = (dataLen >> 16) & 0xff; lh[21] = (dataLen >> 24) & 0xff;
  // uncompressed size (LE) - same as compressed for stored
  lh[22] = dataLen & 0xff; lh[23] = (dataLen >> 8) & 0xff; lh[24] = (dataLen >> 16) & 0xff; lh[25] = (dataLen >> 24) & 0xff;
  // file name length (LE)
  lh[26] = fnLen & 0xff; lh[27] = (fnLen >> 8) & 0xff;
  // extra field length: 0
  lh[28] = 0; lh[29] = 0;
  // filename bytes
  lh.set(filenameBytes, 30);
  // file data
  lh.set(fileData, 30 + fnLen);

  const localOffset = 0;
  const localSize = lh.length;

  // Central directory entry (46 + fnLen bytes)
  const cd = new Uint8Array(46 + fnLen);
  cd[0] = 0x50; cd[1] = 0x4b; cd[2] = 0x01; cd[3] = 0x02;
  cd[4] = 20; cd[5] = 0;  // version made by
  cd[6] = 20; cd[7] = 0;  // version needed
  cd[8] = 0; cd[9] = 0;   // flags
  cd[10] = 0; cd[11] = 0; // compression method
  cd[12] = 0; cd[13] = 0; cd[14] = 0; cd[15] = 0; // mod time/date
  cd[16] = 0; cd[17] = 0; cd[18] = 0; cd[19] = 0; // CRC
  cd[20] = dataLen & 0xff; cd[21] = (dataLen >> 8) & 0xff; cd[22] = (dataLen >> 16) & 0xff; cd[23] = (dataLen >> 24) & 0xff;
  cd[24] = dataLen & 0xff; cd[25] = (dataLen >> 8) & 0xff; cd[26] = (dataLen >> 16) & 0xff; cd[27] = (dataLen >> 24) & 0xff;
  cd[28] = fnLen & 0xff; cd[29] = (fnLen >> 8) & 0xff;
  cd[30] = 0; cd[31] = 0; // extra field length
  cd[32] = 0; cd[33] = 0; // file comment length
  cd[34] = 0; cd[35] = 0; // disk number start
  cd[36] = 0; cd[37] = 0; // internal attrs
  cd[38] = 0; cd[39] = 0; cd[40] = 0; cd[41] = 0; // external attrs
  cd[42] = localOffset & 0xff; cd[43] = (localOffset >> 8) & 0xff; cd[44] = (localOffset >> 16) & 0xff; cd[45] = (localOffset >> 24) & 0xff;
  cd.set(filenameBytes, 46);

  // End-of-central-directory record (22 bytes)
  const eocd = new Uint8Array(22);
  eocd[0] = 0x50; eocd[1] = 0x4b; eocd[2] = 0x05; eocd[3] = 0x06;
  eocd[4] = 0; eocd[5] = 0;   // disk number
  eocd[6] = 0; eocd[7] = 0;   // disk with CD
  eocd[8] = 1; eocd[9] = 0;   // entries on disk
  eocd[10] = 1; eocd[11] = 0; // total entries
  const cdSize = cd.length;
  eocd[12] = cdSize & 0xff; eocd[13] = (cdSize >> 8) & 0xff; eocd[14] = (cdSize >> 16) & 0xff; eocd[15] = (cdSize >> 24) & 0xff;
  const cdOffset = localSize;
  eocd[16] = cdOffset & 0xff; eocd[17] = (cdOffset >> 8) & 0xff; eocd[18] = (cdOffset >> 16) & 0xff; eocd[19] = (cdOffset >> 24) & 0xff;
  eocd[20] = 0; eocd[21] = 0; // comment length

  const total = new Uint8Array(lh.length + cd.length + eocd.length);
  total.set(lh, 0);
  total.set(cd, lh.length);
  total.set(eocd, lh.length + cd.length);
  return total;
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

  it('rejects a ZIP containing a path-traversal entry (../ prefix)', () => {
    const bytes = buildZipWithFilename('../evil/manifest.json', '{}');
    expect(() => extractManifestFromPackage(bytes, 'zip')).toThrow(/path-traversal/);
  });

  it('rejects a ZIP containing a path-traversal entry (embedded ../)', () => {
    const bytes = buildZipWithFilename('addon/../../etc/passwd', 'data');
    expect(() => extractManifestFromPackage(bytes, 'zip')).toThrow(/path-traversal/);
  });

  it('rejects a ZIP containing an absolute-path entry', () => {
    const bytes = buildZipWithFilename('/etc/passwd', 'data');
    expect(() => extractManifestFromPackage(bytes, 'zip')).toThrow(/path-traversal/);
  });

  it('rejects a ZIP containing a null byte in a filename', () => {
    const bytes = buildZipWithFilename('manifest.json\0.exe', '{}');
    expect(() => extractManifestFromPackage(bytes, 'zip')).toThrow(/null byte/);
  });

  it('rejects a ZIP with more than the maximum allowed entry count', () => {
    // Build an archive with one valid entry plus many padding entries that exceed MAX_ZIP_ENTRIES.
    const entries: Record<string, Uint8Array> = {
      'manifest.json': strToU8(JSON.stringify({ name: 'X', version: '1.0', manifest_version: 3 }))
    };
    for (let i = 0; i < 5_001; i++) {
      entries[`padding/file_${i}.txt`] = strToU8('x');
    }
    const bytes = zipSync(entries);
    expect(() => extractManifestFromPackage(bytes, 'zip')).toThrow(/more than 5,000 entries/);
  });
});
