import { describe, expect, it } from 'vitest';
import { validatePublicFetchUrl, validateRedirectDestination } from '../src/url-safety';

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

describe('validateRedirectDestination', () => {
  it('allows safe public HTTPS destinations (e.g. CDN redirects from store downloads)', () => {
    expect(validateRedirectDestination('https://storage.googleapis.com/path/to/extension.crx')).toBeNull();
    expect(validateRedirectDestination('https://dl.google.com/extension.crx')).toBeNull();
    expect(validateRedirectDestination('https://archive.mozilla.org/pub/addon.xpi')).toBeNull();
  });

  it('allows public HTTP CDN destinations (e.g. Microsoft Edge extension CDN)', () => {
    expect(validateRedirectDestination('http://download.microsoft.com/extensions/extension.crx')).toBeNull();
    expect(validateRedirectDestination('http://extensionstorecdn.azureedge.net/extension.crx')).toBeNull();
  });

  it('rejects redirect destinations using unsupported protocols', () => {
    expect(validateRedirectDestination('file:///etc/passwd')).toMatch(/unsupported protocol/i);
    expect(validateRedirectDestination('data:text/plain,evil')).toMatch(/unsupported protocol/i);
    expect(validateRedirectDestination('ftp://example.com/file.zip')).toMatch(/unsupported protocol/i);
  });

  it('rejects redirects to localhost', () => {
    expect(validateRedirectDestination('https://localhost/evil')).toMatch(/local/i);
  });

  it('rejects redirects to .local hostnames', () => {
    expect(validateRedirectDestination('https://internal.local/secret')).toMatch(/local/i);
  });

  it('rejects redirects to private IPv4 ranges', () => {
    expect(validateRedirectDestination('https://10.0.0.1/malware.crx')).toMatch(/private/i);
    expect(validateRedirectDestination('https://172.16.0.1/malware.crx')).toMatch(/private/i);
    expect(validateRedirectDestination('https://192.168.1.1/malware.crx')).toMatch(/private/i);
    expect(validateRedirectDestination('https://127.0.0.1/malware.crx')).toMatch(/private/i);
    expect(validateRedirectDestination('https://169.254.169.254/latest/meta-data/')).toMatch(/private/i);
  });

  it('rejects redirects to IPv6 loopback and private ranges', () => {
    expect(validateRedirectDestination('https://[::1]/evil')).toMatch(/private/i);
    expect(validateRedirectDestination('https://[fc00::1]/evil')).toMatch(/private/i);
    expect(validateRedirectDestination('https://[fe80::1]/evil')).toMatch(/private/i);
  });

  it('rejects redirects to IPv4-mapped IPv6 addresses (::ffff: prefix)', () => {
    // ::ffff:7f00:1 is the IPv6 representation of 127.0.0.1
    expect(validateRedirectDestination('https://[::ffff:7f00:1]/evil')).toMatch(/private/i);
    // ::ffff:c0a8:101 maps to 192.168.1.1
    expect(validateRedirectDestination('https://[::ffff:c0a8:101]/evil')).toMatch(/private/i);
  });

  it('rejects malformed redirect destination URLs', () => {
    expect(validateRedirectDestination('not-a-url')).toMatch(/valid URL/i);
    expect(validateRedirectDestination('')).toMatch(/valid URL/i);
  });
});
