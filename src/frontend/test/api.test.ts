import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeExtensionById, analyzeExtensionByUpload, analyzeExtensionByUrl } from '../src/api';

const baseReport = {
  reportVersion: '1.0.0',
  analyzedAt: '2026-03-12T00:00:00.000Z',
  source: {
    type: 'url',
    value: 'https://example.com/extension.zip'
  },
  metadata: {
    name: 'API Test Extension',
    version: '1.0.0',
    manifestVersion: 3
  },
  permissions: {
    requestedPermissions: [],
    optionalPermissions: [],
    hostPermissions: []
  },
  riskSignals: [],
  score: {
    value: 0,
    severity: 'low',
    rationale: 'test'
  },
  summary: 'test',
  limits: {
    codeExecutionAnalysisPerformed: false,
    notes: []
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('frontend api client', () => {
  it('parses successful URL analysis responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(baseReport), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const report = await analyzeExtensionByUrl('https://example.com/extension.zip');
    expect(report.metadata.name).toBe('API Test Extension');
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('/api/analyze');
  });

  it('throws backend error payloads as user-facing messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Bad request.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    }));

    await expect(analyzeExtensionById('abc')).rejects.toThrow('Bad request.');
  });

  it('throws readable errors for non-json error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html/>', {
      status: 502,
      headers: { 'content-type': 'text/html' }
    }));

    await expect(analyzeExtensionByUrl('https://example.com/extension.zip')).rejects.toThrow(/non-JSON response body/);
  });

  it('throws contract errors for malformed report payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    await expect(analyzeExtensionByUrl('https://example.com/extension.zip')).rejects.toThrow(/malformed report payload/);
  });

  it('sends upload requests via multipart form data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      ...baseReport,
      source: {
        type: 'file',
        filename: 'extension.zip',
        mimeType: 'application/zip'
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const file = new File(['abc'], 'extension.zip', { type: 'application/zip' });
    await analyzeExtensionByUpload(file);

    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('/api/analyze/upload');
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body instanceof FormData).toBe(true);
  });
});

