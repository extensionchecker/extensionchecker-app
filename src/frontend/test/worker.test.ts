import { describe, it, expect, vi } from 'vitest';
import { handleFrontendWorkerRequest, type FrontendWorkerEnv } from '../worker';

function makeEnv(overrides: Partial<FrontendWorkerEnv> = {}): FrontendWorkerEnv {
  return {
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('asset')) },
    ...overrides
  };
}

describe('handleFrontendWorkerRequest', () => {
  describe('asset routing', () => {
    it('forwards non-API requests to ASSETS', async () => {
      const env = makeEnv();
      const request = new Request('https://app.example.com/');
      await handleFrontendWorkerRequest(request, env);
      expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
    });

    it('forwards static asset paths to ASSETS', async () => {
      const env = makeEnv();
      const request = new Request('https://app.example.com/assets/index.js');
      await handleFrontendWorkerRequest(request, env);
      expect(env.ASSETS.fetch).toHaveBeenCalled();
    });
  });

  describe('backend routing', () => {
    it('returns 502 when no backend target is configured', async () => {
      const env = makeEnv();
      const request = new Request('https://app.example.com/api/analyze', { method: 'POST', body: '{}' });
      const response = await handleFrontendWorkerRequest(request, env);
      expect(response.status).toBe(502);
    });

    it('routes /api/* to BACKEND service binding', async () => {
      const backendFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const env = makeEnv({ BACKEND: { fetch: backendFetch } });
      const request = new Request('https://app.example.com/api/analyze', { method: 'POST', body: '{}' });
      await handleFrontendWorkerRequest(request, env);
      expect(backendFetch).toHaveBeenCalled();
    });

    it('routes /health to BACKEND service binding', async () => {
      const backendFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const env = makeEnv({ BACKEND: { fetch: backendFetch } });
      const request = new Request('https://app.example.com/health');
      await handleFrontendWorkerRequest(request, env);
      expect(backendFetch).toHaveBeenCalled();
    });

    it('preserves POST method and body when injecting token', async () => {
      let capturedRequest: Request | null = null;
      const backendFetch = vi.fn().mockImplementation(async (req: Request) => {
        capturedRequest = req;
        return new Response('ok');
      });
      const env = makeEnv({ BACKEND: { fetch: backendFetch }, API_ACCESS_TOKEN: 'test-token' });
      const request = new Request('https://app.example.com/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
        headers: { 'content-type': 'application/json' }
      });
      await handleFrontendWorkerRequest(request, env);

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.method).toBe('POST');
      const body = await capturedRequest!.text();
      expect(body).toBe('{"url":"https://example.com"}');
    });

    it('injects x-extensionchecker-token header when token is set', async () => {
      let capturedRequest: Request | null = null;
      const backendFetch = vi.fn().mockImplementation(async (req: Request) => {
        capturedRequest = req;
        return new Response('ok');
      });
      const env = makeEnv({ BACKEND: { fetch: backendFetch }, API_ACCESS_TOKEN: 'secret-token' });
      const request = new Request('https://app.example.com/api/analyze', { method: 'POST' });
      await handleFrontendWorkerRequest(request, env);

      expect(capturedRequest!.headers.get('x-extensionchecker-token')).toBe('secret-token');
    });

    it('does not inject token header when API_ACCESS_TOKEN is not set', async () => {
      let capturedRequest: Request | null = null;
      const backendFetch = vi.fn().mockImplementation(async (req: Request) => {
        capturedRequest = req;
        return new Response('ok');
      });
      const env = makeEnv({ BACKEND: { fetch: backendFetch } });
      const request = new Request('https://app.example.com/api/analyze', { method: 'POST' });
      await handleFrontendWorkerRequest(request, env);

      expect(capturedRequest!.headers.get('x-extensionchecker-token')).toBeNull();
    });

    it('does not inject token header when API_ACCESS_TOKEN is blank', async () => {
      let capturedRequest: Request | null = null;
      const backendFetch = vi.fn().mockImplementation(async (req: Request) => {
        capturedRequest = req;
        return new Response('ok');
      });
      const env = makeEnv({ BACKEND: { fetch: backendFetch }, API_ACCESS_TOKEN: '   ' });
      const request = new Request('https://app.example.com/api/analyze', { method: 'POST' });
      await handleFrontendWorkerRequest(request, env);

      expect(capturedRequest!.headers.get('x-extensionchecker-token')).toBeNull();
    });
  });
});
