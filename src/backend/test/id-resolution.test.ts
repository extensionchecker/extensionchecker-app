import { describe, expect, it } from 'vitest';
import { resolveExtensionIdToPackage } from '../src/id-resolution';

describe('resolveExtensionIdToPackage', () => {
  it('resolves chrome IDs to CRX update endpoint', () => {
    const resolved = resolveExtensionIdToPackage('abcdefghijklmnopabcdefghijklmnop');

    expect(resolved.packageKind).toBe('crx');
    expect(resolved.canonicalId).toBe('abcdefghijklmnopabcdefghijklmnop');
    expect(resolved.downloadUrl.hostname).toBe('clients2.google.com');
  });

  it('resolves firefox IDs to AMO latest xpi endpoint', () => {
    const resolved = resolveExtensionIdToPackage('ublock-origin');

    expect(resolved.packageKind).toBe('xpi');
    expect(resolved.downloadUrl.hostname).toBe('addons.mozilla.org');
    expect(resolved.downloadUrl.pathname).toContain('/downloads/latest/ublock-origin/');
  });

  it('rejects malformed chrome prefix IDs', () => {
    expect(() => resolveExtensionIdToPackage('chrome:not-valid')).toThrowError(/32 characters/);
  });

  it('rejects safari ids with actionable guidance', () => {
    expect(() => resolveExtensionIdToPackage('safari:1password')).toThrowError(/obtained separately/);
  });

  it('rejects raw safari app-store style ids with actionable guidance', () => {
    expect(() => resolveExtensionIdToPackage('id1569813296')).toThrowError(/Safari App Store IDs/);
  });

  it('resolves edge prefixed IDs to Edge update endpoint', () => {
    const resolved = resolveExtensionIdToPackage('edge:nffknjpglkklphnibdiadeeeeailfnog');

    expect(resolved.packageKind).toBe('crx');
    expect(resolved.canonicalId).toBe('nffknjpglkklphnibdiadeeeeailfnog');
    expect(resolved.downloadUrl.hostname).toBe('edge.microsoft.com');
    expect(resolved.downloadUrl.pathname).toContain('/extensionwebstorebase/v1/crx');
  });

  it('rejects malformed edge prefix IDs', () => {
    expect(() => resolveExtensionIdToPackage('edge:not-valid')).toThrowError(/32 characters/);
  });
});
