import { describe, expect, it } from 'vitest';
import { resolveListingUrlToId } from '../src/listing-url';

describe('resolveListingUrlToId', () => {
  it('extracts chrome extension ID from Chrome Web Store listing URLs', () => {
    const url = new URL('https://chromewebstore.google.com/detail/reader-view/ecabifbgmdmgdllomnfinbmaellmclnh');
    expect(resolveListingUrlToId(url)).toBe('chrome:ecabifbgmdmgdllomnfinbmaellmclnh');
  });

  it('extracts firefox addon slug from AMO listing URLs', () => {
    const url = new URL('https://addons.mozilla.org/firefox/addon/ublock-origin/');
    expect(resolveListingUrlToId(url)).toBe('firefox:ublock-origin');
  });

  it('returns null for non-listing URLs', () => {
    const url = new URL('https://example.com/extension.zip');
    expect(resolveListingUrlToId(url)).toBeNull();
  });

  it('extracts edge extension ID from Edge Add-ons listing URLs', () => {
    const url = new URL('https://microsoftedge.microsoft.com/addons/detail/ublock/nffknjpglkklphnibdiadeeeeailfnog');
    expect(resolveListingUrlToId(url)).toBe('edge:nffknjpglkklphnibdiadeeeeailfnog');
  });

  it('returns null for Edge URLs without a valid extension ID', () => {
    const url = new URL('https://microsoftedge.microsoft.com/addons/detail/ublock');
    expect(resolveListingUrlToId(url)).toBeNull();
  });
});
