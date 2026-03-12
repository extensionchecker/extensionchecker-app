import { describe, expect, it } from 'vitest';
import { validatePublicFetchUrl } from '../src/url-safety';

describe('validatePublicFetchUrl', () => {
  it('accepts public HTTPS URLs', () => {
    const result = validatePublicFetchUrl('https://example.com/file.zip');

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
});
