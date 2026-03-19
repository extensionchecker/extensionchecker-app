/**
 * Comprehensive security validation test suite.
 *
 * Validates the application against OWASP Top 10, OWASP API Top 10,
 * and common pentester/bug-bounty checklists. These tests run on every
 * build to catch security regressions before they reach production.
 *
 * Categories covered:
 *  - Security response headers (OWASP A05: Security Misconfiguration)
 *  - SSRF / private IP blocking (OWASP A10: SSRF)
 *  - Information disclosure (OWASP A01: Broken Access Control)
 *  - Input validation / injection (OWASP A03: Injection)
 *  - Rate limiting (OWASP API4: Unrestricted Resource Consumption)
 *  - Authentication & token handling (OWASP API2: Broken Authentication)
 *  - CORS / origin validation (OWASP A01, A05)
 *  - Content-type enforcement (OWASP A08: Software and Data Integrity)
 *  - Body size limits (OWASP API4)
 *  - Archive adversarial payloads (zip bombs, traversal, null bytes)
 *  - Error response cleanliness (no stack traces or internal details)
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createApp } from '../src/app';
import { validatePublicFetchUrl, validateRedirectDestination } from '../src/url-safety';

const ORIGINAL_FETCH = globalThis.fetch;
const DEFAULT_ORIGIN = 'http://localhost:5173';

function buildManifestZip(overrides: Record<string, unknown> = {}): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify({
      name: 'Security Test Extension',
      version: '1.0.0',
      manifest_version: 3,
      permissions: ['storage'],
      ...overrides
    }))
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

async function requestApi(
  app: ReturnType<typeof createApp>,
  path: string,
  init: RequestInit
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) {
    headers.set('origin', DEFAULT_ORIGIN);
  }
  return app.request(path, { ...init, headers });
}

// ---------------------------------------------------------------------------
// OWASP A05: Security Misconfiguration — Response Headers
// ---------------------------------------------------------------------------
describe('security response headers', () => {
  it('sets all mandatory security headers on API responses', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://chromewebstore.google.com/detail/test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan' } })
    });

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('x-dns-prefetch-control')).toBe('off');
    expect(response.headers.get('x-permitted-cross-domain-policies')).toBe('none');
  });

  it('sets HSTS with includeSubDomains and preload directives', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://chromewebstore.google.com/detail/test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan' } })
    });

    const hsts = response.headers.get('strict-transport-security');
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('sets Content-Security-Policy that blocks all framing and default loading', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://chromewebstore.google.com/detail/test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan' } })
    });

    const csp = response.headers.get('content-security-policy');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('sets Permissions-Policy blocking browsing-topics (FLoC replacement)', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://chromewebstore.google.com/detail/test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan' } })
    });

    const pp = response.headers.get('permissions-policy');
    expect(pp).toContain('browsing-topics=()');
  });

  it('sets cache-control: no-store on API responses to prevent caching', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://chromewebstore.google.com/detail/test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan' } })
    });

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// OWASP A10: SSRF — Comprehensive Private IP Blocking
// ---------------------------------------------------------------------------
describe('SSRF private IP blocking', () => {
  // RFC 1122: "This host on this network" (0.0.0.0/8)
  it('blocks 0.0.0.0/8 ("this network") addresses', () => {
    expect(validatePublicFetchUrl('https://0.0.0.0/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://0.1.2.3/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://0.255.255.255/file.zip').ok).toBe(false);
  });

  // RFC 1918: Private-Use (10/8)
  it('blocks all 10.0.0.0/8 private addresses', () => {
    expect(validatePublicFetchUrl('https://10.0.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://10.255.255.255/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://10.128.0.1/file.zip').ok).toBe(false);
  });

  // RFC 6598: Shared Address Space (100.64/10) — Carrier-Grade NAT
  it('blocks 100.64.0.0/10 (CGNAT / Shared Address Space)', () => {
    expect(validatePublicFetchUrl('https://100.64.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://100.100.100.100/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://100.127.255.255/file.zip').ok).toBe(false);
  });

  // RFC 1918: Private-Use (172.16/12)
  it('blocks 172.16.0.0/12 private addresses', () => {
    expect(validatePublicFetchUrl('https://172.16.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://172.31.255.255/file.zip').ok).toBe(false);
    // 172.32.x.x should be allowed (outside the private range)
    // but blocked by the submission host allowlist
  });

  // RFC 1918: Private-Use (192.168/16)
  it('blocks 192.168.0.0/16 private addresses', () => {
    expect(validatePublicFetchUrl('https://192.168.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://192.168.255.255/file.zip').ok).toBe(false);
  });

  // RFC 3927: Link-Local (169.254/16)
  it('blocks 169.254.0.0/16 link-local and cloud metadata endpoint', () => {
    expect(validatePublicFetchUrl('https://169.254.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://169.254.169.254/latest/meta-data/').ok).toBe(false);
    expect(validatePublicFetchUrl('https://169.254.255.255/file.zip').ok).toBe(false);
  });

  // RFC 5737: TEST-NET-1, TEST-NET-2, TEST-NET-3
  it('blocks TEST-NET documentation ranges (RFC 5737)', () => {
    expect(validatePublicFetchUrl('https://192.0.2.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://198.51.100.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://203.0.113.1/file.zip').ok).toBe(false);
  });

  // RFC 2544: Benchmark testing (198.18/15)
  it('blocks 198.18.0.0/15 (benchmark testing range)', () => {
    expect(validatePublicFetchUrl('https://198.18.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://198.19.255.255/file.zip').ok).toBe(false);
  });

  // RFC 6890: IETF Protocol Assignments (192.0.0.0/24)
  it('blocks 192.0.0.0/24 (IETF protocol assignments)', () => {
    expect(validatePublicFetchUrl('https://192.0.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://192.0.0.255/file.zip').ok).toBe(false);
  });

  // RFC 1112: Reserved for future use (240/4) and broadcast address
  it('blocks 240.0.0.0/4 (reserved) and 255.255.255.255 (broadcast)', () => {
    expect(validatePublicFetchUrl('https://240.0.0.1/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://255.255.255.255/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://250.1.2.3/file.zip').ok).toBe(false);
  });

  // IPv6 private ranges
  it('blocks IPv6 loopback (::1)', () => {
    expect(validateRedirectDestination('https://[::1]/evil')).toMatch(/private/i);
  });

  it('blocks IPv6 ULA (fc00::/7)', () => {
    expect(validateRedirectDestination('https://[fc00::1]/evil')).toMatch(/private/i);
    expect(validateRedirectDestination('https://[fd12:3456::1]/evil')).toMatch(/private/i);
  });

  it('blocks IPv6 link-local (fe80::/10)', () => {
    expect(validateRedirectDestination('https://[fe80::1]/evil')).toMatch(/private/i);
  });

  it('blocks IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)', () => {
    expect(validateRedirectDestination('https://[::ffff:127.0.0.1]/evil')).toMatch(/private/i);
    expect(validateRedirectDestination('https://[::ffff:10.0.0.1]/evil')).toMatch(/private/i);
    expect(validateRedirectDestination('https://[::ffff:192.168.1.1]/evil')).toMatch(/private/i);
    expect(validateRedirectDestination('https://[::ffff:7f00:1]/evil')).toMatch(/private/i);
  });

  // Protocol-based SSRF variations
  it('rejects non-HTTPS protocols (file, data, javascript, ftp)', () => {
    expect(validatePublicFetchUrl('file:///etc/passwd').ok).toBe(false);
    expect(validatePublicFetchUrl('data:text/html,<script>alert(1)</script>').ok).toBe(false);
    expect(validatePublicFetchUrl('javascript:alert(1)').ok).toBe(false);
    expect(validatePublicFetchUrl('ftp://evil.com/file.zip').ok).toBe(false);
  });

  it('rejects redirect destinations with dangerous protocols', () => {
    expect(validateRedirectDestination('file:///etc/passwd')).toMatch(/unsupported protocol/i);
    expect(validateRedirectDestination('data:text/plain,evil')).toMatch(/unsupported protocol/i);
  });

  it('blocks localhost and .local domains', () => {
    expect(validatePublicFetchUrl('https://localhost/file.zip').ok).toBe(false);
    expect(validatePublicFetchUrl('https://my-service.local/file.zip').ok).toBe(false);
    expect(validateRedirectDestination('https://localhost:8080/evil')).toMatch(/local/i);
    expect(validateRedirectDestination('https://internal.local/secret')).toMatch(/local/i);
  });
});

// ---------------------------------------------------------------------------
// OWASP A01: Broken Access Control — Information Disclosure
// ---------------------------------------------------------------------------
describe('information disclosure prevention', () => {
  it('global error handler returns generic message, never raw error.message', async () => {
    const app = createApp({ securityConfig: { allowRequestsWithoutOrigin: true } });

    // Trigger an unhandled exception in the request pipeline
    vi.spyOn(await import('../src/security'), 'isJsonContentType').mockImplementation(() => {
      throw new Error('Revealing internal path: /workspaces/extensionchecker-app/src/backend/node_modules/fflate/esm/browser.js');
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://chromewebstore.google.com/detail/test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan' } })
    });

    expect(response.status).toBe(500);
    const body = await response.json() as { error: string };
    // Must be generic - never contain internal paths, library names, or stack traces
    expect(body.error).toBe('Internal server error.');
    expect(body.error).not.toContain('/workspaces');
    expect(body.error).not.toContain('fflate');
    expect(body.error).not.toContain('node_modules');
  });

  it('error responses for invalid input do not reveal backend framework details', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json'
    });

    const body = await response.json() as { error: string };
    expect(body.error).not.toContain('SyntaxError');
    expect(body.error).not.toContain('JSON.parse');
    expect(body.error).not.toContain('hono');
    expect(body.error).not.toContain('vitest');
  });

  it('error responses for failed downloads do not reveal internal URLs', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:443');
    }) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/test/addon-latest.xpi' }
      })
    });

    // We allow the wrapped error message in 502 responses since it comes from
    // our own code (download.ts), but verify it starts with our controlled prefix
    expect(response.status).toBe(502);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/^Failed to download extension package:/);
  });

  it('SSE stream error events use generic messages for unexpected errors', async () => {
    const zipBytes = buildManifestZip();
    globalThis.fetch = vi.fn(async () => new Response(zipBytes, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    // Trigger error during manifest extraction
    const archiveMod = await import('../src/archive');
    vi.spyOn(archiveMod, 'detectPackageKind').mockImplementation(() => {
      throw new Error('Internal: fflate decompression buffer overflow at 0xdeadbeef');
    });

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'text/event-stream'
      },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock/addon-latest.xpi' }
      })
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('event: error');
    // The error message sent over SSE must be generic
    expect(text).not.toContain('fflate');
    expect(text).not.toContain('0xdeadbeef');
    expect(text).not.toContain('decompression buffer');
  });
});

// ---------------------------------------------------------------------------
// OWASP A03: Injection — Input Validation & Fuzzing
// ---------------------------------------------------------------------------
describe('input validation and injection prevention', () => {
  it('rejects URL source with javascript: protocol', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'javascript:alert(1)' } })
    });

    expect(response.status).toBe(400);
  });

  it('rejects URL source with data: protocol', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'data:text/html,<script>alert(1)</script>' } })
    });

    expect(response.status).toBe(400);
  });

  it('rejects empty string for ID source', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'id', value: '' } })
    });

    expect(response.status).toBe(400);
  });

  it('rejects ID source exceeding max length (256 chars)', async () => {
    const app = createApp();
    const longId = 'a'.repeat(257);
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'id', value: longId } })
    });

    expect(response.status).toBe(400);
  });

  it('handles null bytes in JSON strings gracefully', async () => {
    globalThis.fetch = vi.fn(async () => new Response(buildManifestZip(), {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'id', value: 'firefox:test\x00injected' } })
    });

    // Should process as a normal (invalid) ID — no crash
    expect([200, 400, 502]).toContain(response.status);
  });

  it('handles Unicode edge cases in ID without crashing', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, {
      status: 404
    })) as typeof fetch;

    const app = createApp();
    const unicodeId = '\u202E\uFEFF'; // RTL override, BOM
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'id', value: `firefox:${unicodeId}` } })
    });

    expect([400, 502]).toContain(response.status);
  });

  it('rejects request bodies that are not JSON objects', async () => {
    const app = createApp();

    // Array body
    const arrResponse = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '[]'
    });
    expect(arrResponse.status).toBe(400);

    // String body
    const strResponse = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '"hello"'
    });
    expect(strResponse.status).toBe(400);

    // Number body
    const numResponse = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '42'
    });
    expect(numResponse.status).toBe(400);

    // Null body
    const nullResponse = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'null'
    });
    expect(nullResponse.status).toBe(400);
  });

  it('rejects deeply nested JSON without crashing (JSON bomb)', async () => {
    const app = createApp();
    // Construct deeply nested JSON object
    let nested = '{"source": {"type":"url","value":"https://example.com"}}';
    for (let i = 0; i < 100; i++) {
      nested = `{"nested": ${nested}}`;
    }

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: nested
    });

    // Should reject via schema validation, not crash
    expect(response.status).toBe(400);
  });

  it('rejects unknown source types', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'exec', value: 'rm -rf /' } })
    });

    expect(response.status).toBe(400);
  });

  it('rejects extra unexpected fields in source (strict schema)', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', value: 'not-a-valid-url' },
        __proto__: { admin: true }
      })
    });

    // Should not crash or promote prototype pollution
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// OWASP A08: Software and Data Integrity — Content-Type Enforcement
// ---------------------------------------------------------------------------
describe('content-type enforcement', () => {
  it('rejects analyze requests without content-type', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(415);
  });

  it('rejects analyze requests with text/plain content-type', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(415);
  });

  it('rejects upload requests without multipart content-type', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });

    expect(response.status).toBe(415);
  });

  it('rejects analyze requests with application/x-www-form-urlencoded', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'source[type]=url&source[value]=https://example.com'
    });

    expect(response.status).toBe(415);
  });
});

// ---------------------------------------------------------------------------
// OWASP API4: Unrestricted Resource Consumption — Body Size Limits
// ---------------------------------------------------------------------------
describe('body size limits', () => {
  it('rejects analyze JSON body exceeding 16 KB', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(20 * 1024)
      },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' }, padding: 'x'.repeat(17000) })
    });

    expect(response.status).toBe(413);
  });

  it('rejects upload exceeding declared content-length limit', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': String(100 * 1024 * 1024)
      },
      body: '--test--'
    });

    expect(response.status).toBe(413);
  });
});

// ---------------------------------------------------------------------------
// OWASP API2: Broken Authentication — Token Validation
// ---------------------------------------------------------------------------
describe('API access token validation', () => {
  it('rejects requests with wrong token when token is configured', async () => {
    const app = createApp({
      securityConfig: {
        apiAccessToken: 'correct-secret-token-12345',
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-extensionchecker-token': 'wrong-token'
      },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(401);
  });

  it('rejects requests with empty token when token is configured', async () => {
    const app = createApp({
      securityConfig: {
        apiAccessToken: 'correct-secret-token-12345',
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-extensionchecker-token': ''
      },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(401);
  });

  it('rejects requests with only whitespace as token', async () => {
    const app = createApp({
      securityConfig: {
        apiAccessToken: 'correct-secret-token-12345',
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-extensionchecker-token': '   '
      },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(401);
  });

  it('accepts requests with correct token', async () => {
    globalThis.fetch = vi.fn(async () => new Response(buildManifestZip(), {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp({
      securityConfig: {
        apiAccessToken: 'correct-secret-token-12345',
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-extensionchecker-token': 'correct-secret-token-12345'
      },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/test/addon-latest.xpi' }
      })
    });

    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// OWASP A01 / A05: CORS and Origin Validation
// ---------------------------------------------------------------------------
describe('CORS and origin validation', () => {
  it('rejects cross-origin requests from unlisted origins', async () => {
    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: new Headers({
        'origin': 'https://evil-site.com',
        'content-type': 'application/json'
      }),
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(403);
  });

  it('returns CORS headers only for allowed origins', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'OPTIONS',
      headers: { 'origin': DEFAULT_ORIGIN }
    });

    expect(response.headers.get('access-control-allow-origin')).toBe(DEFAULT_ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('does not reflect arbitrary origins in CORS headers', async () => {
    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'OPTIONS',
      headers: new Headers({
        'origin': 'https://attacker.com'
      })
    });

    // Should not echo back the attacker's origin
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://attacker.com');
  });

  it('rejects malformed origin headers', async () => {
    const app = createApp();
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: new Headers({
        'origin': 'not-a-valid-origin',
        'content-type': 'application/json'
      }),
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(400);
  });

  it('blocks requests without origin when allowRequestsWithoutOrigin is false', async () => {
    const app = createApp({ securityConfig: { allowRequestsWithoutOrigin: false } });
    const response = await app.request('/api/analyze', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json'
      }),
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// OWASP API4: Unrestricted Resource Consumption — Rate Limiting
// ---------------------------------------------------------------------------
describe('rate limiting', () => {
  it('enforces per-minute rate limits and returns retry-after header', async () => {
    const fixedNow = Date.now();
    const app = createApp({
      securityConfig: {
        rateLimitPerMinutePerIp: 2,
        rateLimitPerDayPerIp: 100,
        rateLimitGlobalPerDay: 1000,
        allowRequestsWithoutOrigin: true
      },
      now: () => fixedNow
    });

    // First two should succeed
    const r1 = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });
    expect(r1.status).not.toBe(429);

    const r2 = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });
    expect(r2.status).not.toBe(429);

    // Third should be rate limited
    const r3 = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });
    expect(r3.status).toBe(429);
    expect(r3.headers.get('retry-after')).toBeTruthy();
  });

  it('returns rate limit headers on successful requests', async () => {
    const app = createApp({
      securityConfig: { allowRequestsWithoutOrigin: true }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    // Rate limit headers should be present on non-429 responses too
    expect(response.headers.get('x-ratelimit-limit-minute-ip')).toBeTruthy();
    expect(response.headers.get('x-ratelimit-remaining-minute-ip')).toBeTruthy();
    expect(response.headers.get('x-ratelimit-limit-day-ip')).toBeTruthy();
    expect(response.headers.get('x-ratelimit-limit-day-global')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Archive Security — Adversarial ZIP Payloads
// ---------------------------------------------------------------------------
describe('archive adversarial payloads', () => {
  it('rejects archives with path traversal entries', async () => {
    const maliciousZip = zipSync({
      '../../../etc/passwd': strToU8('root:x:0:0:root:/root:/bin/bash'),
      'manifest.json': strToU8(JSON.stringify({
        name: 'Evil', version: '1.0.0', manifest_version: 3
      }))
    });

    globalThis.fetch = vi.fn(async () => new Response(maliciousZip, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/evil/addon-latest.xpi' }
      })
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/path.traversal/i);
  });

  it('rejects archives containing entries with null bytes in filenames', async () => {
    const maliciousZip = zipSync({
      'manifest.json\x00.exe': strToU8(JSON.stringify({
        name: 'Evil', version: '1.0.0', manifest_version: 3
      }))
    });

    globalThis.fetch = vi.fn(async () => new Response(maliciousZip, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/evil/addon-latest.xpi' }
      })
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/null byte/i);
  });

  it('rejects packages missing manifest.json entirely', async () => {
    const noManifestZip = zipSync({
      'readme.txt': strToU8('This is not a browser extension.')
    });

    globalThis.fetch = vi.fn(async () => new Response(noManifestZip, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/test/addon-latest.xpi' }
      })
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toContain('manifest.json');
  });

  it('rejects packages with invalid JSON in manifest.json', async () => {
    const invalidJsonZip = zipSync({
      'manifest.json': strToU8('{name: not valid json!!!')
    });

    globalThis.fetch = vi.fn(async () => new Response(invalidJsonZip, {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: { type: 'url', value: 'https://addons.mozilla.org/firefox/downloads/latest/test/addon-latest.xpi' }
      })
    });

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// HTTP Method Validation
// ---------------------------------------------------------------------------
describe('HTTP method enforcement', () => {
  it('rejects GET requests to analyze endpoint', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'GET'
    });

    // Should not be 200 - only POST is valid
    expect(response.status).toBe(404);
  });

  it('rejects PUT requests to analyze endpoint', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(404);
  });

  it('rejects DELETE requests to analyze endpoint', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze', {
      method: 'DELETE'
    });

    expect(response.status).toBe(404);
  });

  it('rejects PATCH requests to upload endpoint', async () => {
    const app = createApp();
    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'PATCH'
    });

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Scraper Response Safety
// ---------------------------------------------------------------------------
describe('scraper response safety', () => {
  it('scraper returns null for oversized HTML responses', async () => {
    // The scrapers now reject responses over 2 MB. Verify the Chrome scraper
    // handles this by importing and calling it directly.
    const { fetchChromeStoreData } = await import('../src/scrapers/chrome');

    const hugeHtml = 'x'.repeat(3 * 1024 * 1024); // 3 MB
    const mockFetch = vi.fn(async () => new Response(hugeHtml, {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })) as unknown as typeof fetch;

    const result = await fetchChromeStoreData('testextensionidtestextensi', mockFetch, 5000);
    expect(result).toBeNull();
  });

  it('Edge scraper returns null for oversized HTML responses', async () => {
    const { fetchEdgeStoreData } = await import('../src/scrapers/edge');

    const hugeHtml = 'x'.repeat(3 * 1024 * 1024);
    const mockFetch = vi.fn(async () => new Response(hugeHtml, {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })) as unknown as typeof fetch;

    const result = await fetchEdgeStoreData('testextensionidtestextensi', mockFetch, 5000);
    expect(result).toBeNull();
  });

  it('Opera scraper returns null for oversized HTML responses', async () => {
    const { fetchOperaStoreData } = await import('../src/scrapers/opera');

    const hugeHtml = 'x'.repeat(3 * 1024 * 1024);
    const mockFetch = vi.fn(async () => new Response(hugeHtml, {
      status: 200,
      headers: { 'content-type': 'text/html' }
    })) as unknown as typeof fetch;

    const result = await fetchOperaStoreData('test-extension-slug', mockFetch, 5000);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Path / Route Enumeration Prevention
// ---------------------------------------------------------------------------
describe('route enumeration prevention', () => {
  it('returns 404 for unknown API paths (no directory listing)', async () => {
    const app = createApp({ securityConfig: { allowRequestsWithoutOrigin: true } });

    const paths = [
      '/api/',
      '/api/admin',
      '/api/debug',
      '/api/config',
      '/api/internal',
      '/api/.env',
      '/api/analyze/../admin',
      '/api/v1/analyze',
      '/api/analyze/status'
    ];

    for (const path of paths) {
      const response = await requestApi(app, path, { method: 'GET' });
      expect(response.status).toBe(404);
    }
  });

  it('health endpoint returns minimal information', async () => {
    const app = createApp();
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    // Should only contain `status` - no server version, uptime, or debug info
    expect(Object.keys(body)).toEqual(['status']);
    expect(body.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Constant-Time Token Comparison
// ---------------------------------------------------------------------------
describe('constant-time token comparison', () => {
  it('rejects tokens that differ only in the last character', async () => {
    const app = createApp({
      securityConfig: {
        apiAccessToken: 'secret-token-abcdefghij',
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-extensionchecker-token': 'secret-token-abcdefghik'
      },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(401);
  });

  it('rejects tokens of different lengths', async () => {
    const app = createApp({
      securityConfig: {
        apiAccessToken: 'correct-token',
        allowRequestsWithoutOrigin: true
      }
    });

    const response = await requestApi(app, '/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-extensionchecker-token': 'correct-toke'
      },
      body: JSON.stringify({ source: { type: 'url', value: 'https://example.com' } })
    });

    expect(response.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Upload Filename Validation
// ---------------------------------------------------------------------------
describe('upload filename and extension validation', () => {
  it('rejects uploads with disallowed file extensions', async () => {
    const app = createApp();
    const formData = new FormData();
    formData.set('file', new File([new Uint8Array(100)], 'malware.exe', { type: 'application/octet-stream' }));

    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/\.zip.*\.xpi.*\.crx/);
  });

  it('rejects uploads with double extension attacks', async () => {
    const app = createApp();
    const formData = new FormData();
    formData.set('file', new File([new Uint8Array(100)], 'extension.zip.exe', { type: 'application/octet-stream' }));

    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(400);
  });

  it('rejects upload requests without a file field', async () => {
    const app = createApp();
    const formData = new FormData();
    formData.set('notfile', 'just-a-string');

    const response = await requestApi(app, '/api/analyze/upload', {
      method: 'POST',
      body: formData
    });

    expect(response.status).toBe(400);
  });
});
