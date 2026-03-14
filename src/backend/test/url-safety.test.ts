import { describe, expect, it } from 'vitest';
import { validatePublicFetchUrl } from '../src/url-safety';

describe('validatePublicFetchUrl', () => {
  it('accepts supported public HTTPS URLs', () => {
    const result = validatePublicFetchUrl('https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi');

    expect(result.ok).toBe(true);
  });

  it('accepts Opera Add-ons URLs as recognized extension store URLs', () => {
    const result = validatePublicFetchUrl('https://addons.opera.com/en/extensions/details/ublock/');

    expect(result.ok).toBe(true);
  });

  it('rejects non-https URLs', () => {
    const result = validatePublicFetchUrl('http://example.com/file.zip');

    expect(result.ok).toBe(false);
  });

  it('rejects localhost and private address targets', () => {
    expect(validatePublicFetchUrl('https://localhost/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://192.168.1.10/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://127.0.0.1/file.zip').ok).toBe(false);
  });

  it('rejects unsupported public domains', () => {
    expect(validatePublicFetchUrl('https://example.com/file.zip').ok).toBe(false);
  });

  it('accepts Edge Add-ons and Edge update URLs', () => {
    expect(validatePublicFetchUrl('https://microsoftedge.microsoft.com/addons/detail/ublock/nffknjpglkklphnibdiadeeeeailfnog').ok).toBe(true);
    expect(validatePublicFetchUrl('https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&x=test').ok).toBe(true);
  });
});
