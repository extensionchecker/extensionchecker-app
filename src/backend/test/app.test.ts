import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createApp } from '../src/app';

const ORIGINAL_FETCH = globalThis.fetch;

function buildManifestZip(): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify({
      name: 'Backend Test Extension',
      version: '1.0.0',
      manifest_version: 3,
      permissions: ['cookies'],
      host_permissions: ['<all_urls>']
    }))
  });
}

function buildCrxManifest(): Uint8Array {
  const zipBytes = buildManifestZip();
  const header = new Uint8Array(12);
  header.set(strToU8('Cr24'), 0);
  const view = new DataView(header.buffer);
  view.setUint32(4, 3, true);
  view.setUint32(8, 0, true);

  const crxBytes = new Uint8Array(header.length + zipBytes.length);
  crxBytes.set(header, 0);
  crxBytes.set(zipBytes, header.length);

  return crxBytes;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('backend app', () => {
  it('returns report for valid URL package request', async () => {
    const zipBytes = buildManifestZip();

    globalThis.fetch = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: {
        'content-type': 'application/zip'
      }
    })) as typeof fetch;

    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://example.com/extension.zip'
        }
      })
    });

    expect(response.status).toBe(200);

    const body = await response.json() as { score: { value: number } };
    expect(body.score.value).toBeGreaterThan(0);
  });

  it('resolves chrome listing URL to package download', async () => {
    const crxBytes = buildCrxManifest();
    const fetchSpy = vi.fn(async () => new Response(crxBytes, {
      status: 200,
      headers: {
        'content-type': 'application/x-chrome-extension'
      }
    }));

    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://chromewebstore.google.com/detail/reader-view/ecabifbgmdmgdllomnfinbmaellmclnh'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('clients2.google.com/service/update2/crx');
  });

  it('resolves and analyzes firefox extension ID input', async () => {
    const zipBytes = buildManifestZip();
    const fetchSpy = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: {
        'content-type': 'application/x-chrome-extension'
      }
    }));

    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'id',
          value: 'ublock-origin'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const firstCallUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(firstCallUrl).toContain('addons.mozilla.org/firefox/downloads/latest/ublock-origin');
  });

  it('accepts upload endpoint and returns a report', async () => {
    const form = new FormData();
    form.set('file', new File([buildManifestZip()], 'extension.zip', { type: 'application/zip' }));

    const app = createApp();
    const response = await app.request('/api/analyze/upload', {
      method: 'POST',
      body: form
    });

    expect(response.status).toBe(200);

    const body = await response.json() as { source: { type: string } };
    expect(body.source.type).toBe('file');
  });

  it('rejects upload endpoint for unsupported extension', async () => {
    const form = new FormData();
    form.set('file', new File([strToU8('dummy')], 'extension.txt', { type: 'text/plain' }));

    const app = createApp();
    const response = await app.request('/api/analyze/upload', {
      method: 'POST',
      body: form
    });

    expect(response.status).toBe(400);
  });

  it('rejects unsafe URL input', async () => {
    const app = createApp();

    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://localhost/extension.zip'
        }
      })
    });

    expect(response.status).toBe(400);
  });
});
