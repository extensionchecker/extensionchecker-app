import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createApp } from '../src/app';

const ORIGINAL_FETCH = globalThis.fetch;
const DEFAULT_ORIGIN = 'http://localhost';

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

async function requestApi(app: ReturnType<typeof createApp>, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) {
    headers.set('origin', DEFAULT_ORIGIN);
  }

  return app.request(path, {
    ...init,
    headers
  });
}

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
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(200);

    const body = await response.json() as { score: { value: number } };
    expect(body.score.value).toBeGreaterThan(0);
  });

  it('accepts direct Chrome update endpoint URLs as package inputs', async () => {
    const crxBytes = buildCrxManifest();
    const fetchSpy = vi.fn(async () => new Response(crxBytes, {
      status: 200,
      headers: {
        'content-type': 'application/x-chrome-extension'
      }
    }));
    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://clients2.google.com/service/update2/crx?response=redirect&x=id%3Decabifbgmdmgdllomnfinbmaellmclnh%26installsource%3Dondemand%26uc'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects analyze requests with non-json content type', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain'
      },
      body: 'hello'
    });

    expect(response.status).toBe(415);
  });

  it('rejects oversized analyze json payloads', async () => {
    const app = createApp();
    const oversizedId = 'a'.repeat(20_000);
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'id',
          value: oversizedId
        }
      })
    });

    expect(response.status).toBe(413);
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
    const response = await requestApi(app, '/api/analyze', {
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
    const response = await requestApi(app, '/api/analyze', {
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
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: form
    });

    expect(response.status).toBe(200);

    const body = await response.json() as { source: { type: string } };
    expect(body.source.type).toBe('file');
  });

  it('rejects upload endpoint with non-multipart content type', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ hello: 'world' })
    });

    expect(response.status).toBe(415);
  });

  it('rejects upload endpoint for unsupported extension', async () => {
    const form = new FormData();
    form.set('file', new File([strToU8('dummy')], 'extension.txt', { type: 'text/plain' }));

    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: form
    });

    expect(response.status).toBe(400);
  });

  it('returns parse errors for malformed upload archives', async () => {
    const form = new FormData();
    form.set('file', new File([strToU8('not-an-archive')], 'extension.zip', { type: 'application/zip' }));

    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: form
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Failed to parse package archive/);
  });

  it('returns schema errors when uploaded manifest is missing required fields', async () => {
    const invalidZip = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        version: '1.0.0',
        manifest_version: 3
      }))
    });
    const form = new FormData();
    form.set('file', new File([invalidZip], 'extension.zip', { type: 'application/zip' }));

    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: form
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/missing required fields/);
  });

  it('rejects unsafe URL input', async () => {
    const app = createApp();

    const response = await requestApi(app, '/api/analyze', {
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

  it('rejects unsupported source domains with a clear message', async () => {
    const app = createApp();

    const response = await requestApi(app, '/api/analyze', {
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

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Unsupported URL domain/);
  });

  it('returns Safari URL guidance instead of archive parse failure', async () => {
    const fetchSpy = vi.fn(async () => new Response('should-not-fetch', { status: 200 }));
    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://apps.apple.com/us/app/1password-password-manager/id1511601750'
        }
      })
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/cannot be analyzed directly/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns Safari ID guidance instead of attempting firefox download', async () => {
    const fetchSpy = vi.fn(async () => new Response('should-not-fetch', { status: 200 }));
    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'id',
          value: 'id1569813296'
        }
      })
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Safari App Store IDs/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects requests from disallowed origins', async () => {
    const app = createApp({
      securityConfig: {
        allowedOrigins: new Set(['https://trusted.example'])
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        origin: 'https://malicious.example',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(403);
  });

  it('rejects requests without origin by default', async () => {
    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(403);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Origin header is required/);
  });

  it('allows missing origin only when explicitly configured', async () => {
    const zipBytes = buildManifestZip();
    globalThis.fetch = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: {
        'content-type': 'application/zip'
      }
    })) as typeof fetch;

    const app = createApp({
      securityConfig: {
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(200);
  });

  it('returns CORS headers for allowed preflight requests', async () => {
    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'OPTIONS',
      headers: {
        origin: DEFAULT_ORIGIN,
        'access-control-request-method': 'POST'
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(DEFAULT_ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('rejects malformed origin headers', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        origin: '://not-valid-origin',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(400);
  });

  it('requires configured API access token', async () => {
    const app = createApp({
      securityConfig: {
        apiAccessToken: 'test-token'
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(401);
  });

  it('applies per-minute rate limits by IP', async () => {
    const zipBytes = buildManifestZip();
    const fetchSpy = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: {
        'content-type': 'application/zip'
      }
    }));
    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp({
      securityConfig: {
        rateLimitPerMinutePerIp: 1,
        rateLimitPerDayPerIp: 10,
        rateLimitGlobalPerDay: 100
      }
    });

    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '203.0.113.42'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    };

    const first = await requestApi(app, '/api/analyze', requestInit);
    const second = await requestApi(app, '/api/analyze', requestInit);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns upstream download errors as 502', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('upstream timeout');
    }) as typeof fetch;

    const app = createApp({
      securityConfig: {
        upstreamTimeoutMs: 1_000
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(502);
    const body = await response.json() as { error?: string };
    expect(body.error).toMatch(/Failed to download extension package/);
  });

  it('resolves Edge listing URL to edge update endpoint', async () => {
    const crxBytes = buildCrxManifest();
    const fetchSpy = vi.fn(async () => new Response(crxBytes, {
      status: 200,
      headers: {
        'content-type': 'application/x-chrome-extension'
      }
    }));
    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://microsoftedge.microsoft.com/addons/detail/ublock/nffknjpglkklphnibdiadeeeeailfnog'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('edge.microsoft.com/extensionwebstorebase/v1/crx');
  });

  it('resolves edge-prefixed ID to edge update endpoint', async () => {
    const crxBytes = buildCrxManifest();
    const fetchSpy = vi.fn(async () => new Response(crxBytes, {
      status: 200,
      headers: {
        'content-type': 'application/x-chrome-extension'
      }
    }));
    globalThis.fetch = fetchSpy as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'id',
          value: 'edge:nffknjpglkklphnibdiadeeeeailfnog'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('edge.microsoft.com/extensionwebstorebase/v1/crx');
  });

  it('includes storeMetadata in analysis report', async () => {
    const zipBytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({
        name: 'Metadata Test Extension',
        version: '2.0.0',
        manifest_version: 3,
        description: 'A test extension with metadata',
        author: 'Test Author',
        homepage_url: 'https://example.com',
        developer: {
          name: 'Dev Name',
          url: 'https://dev.example.com'
        },
        permissions: ['storage']
      }))
    });

    globalThis.fetch = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: {
        'content-type': 'application/zip'
      }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/metadata-test/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      storeMetadata?: {
        description?: string;
        author?: string;
        developerName?: string;
        developerUrl?: string;
        homepageUrl?: string;
        packageSizeBytes?: number;
        storeUrl?: string;
      };
    };
    expect(body.storeMetadata).toBeDefined();
    expect(body.storeMetadata?.description).toBe('A test extension with metadata');
    expect(body.storeMetadata?.author).toBe('Test Author');
    expect(body.storeMetadata?.developerName).toBe('Dev Name');
    expect(body.storeMetadata?.developerUrl).toBe('https://dev.example.com');
    expect(body.storeMetadata?.homepageUrl).toBe('https://example.com');
    expect(body.storeMetadata?.packageSizeBytes).toBeGreaterThan(0);
    expect(body.storeMetadata?.storeUrl).toContain('addons.mozilla.org');
  });

  it('returns SSE progress events when Accept: text/event-stream is set', async () => {
    const zipBytes = buildManifestZip();
    globalThis.fetch = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'text/event-stream'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const text = await response.text();
    const events = text.split('\n\n').filter(Boolean);

    const progressEvents = events.filter(e => e.includes('event: progress'));
    const resultEvents = events.filter(e => e.includes('event: result'));

    expect(progressEvents.length).toBeGreaterThanOrEqual(4);
    expect(resultEvents.length).toBe(1);

    const firstProgress = progressEvents[0];
    expect(firstProgress).toContain('resolving');

    const resultData = resultEvents[0]?.split('\n').find(l => l.startsWith('data:'))?.slice(5).trim();
    const report = JSON.parse(resultData as string) as { metadata?: { name?: string } };
    expect(report.metadata?.name).toBe('Backend Test Extension');
  });

  it('returns SSE error event on download failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const app = createApp({ securityConfig: { upstreamTimeoutMs: 1_000 } });
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'text/event-stream'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(200);

    const text = await response.text();
    const errorEvents = text.split('\n\n').filter(e => e.includes('event: error'));
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0]).toContain('network down');
  });

  it('returns JSON (not SSE) when Accept header is absent', async () => {
    const zipBytes = buildManifestZip();
    globalThis.fetch = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        source: {
          type: 'url',
          value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
        }
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('returns SSE progress events for upload when Accept: text/event-stream is set', async () => {
    const zipBytes = buildManifestZip();
    const file = new File([zipBytes], 'extension.zip', { type: 'application/zip' });
    const formData = new FormData();
    formData.set('file', file);

    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      headers: {
        'accept': 'text/event-stream'
      },
      body: formData
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const text = await response.text();
    const events = text.split('\n\n').filter(Boolean);

    const progressEvents = events.filter(e => e.includes('event: progress'));
    const resultEvents = events.filter(e => e.includes('event: result'));

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(resultEvents.length).toBe(1);
  });
});
