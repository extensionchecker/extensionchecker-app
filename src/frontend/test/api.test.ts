import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeExtensionById, analyzeExtensionByUpload, analyzeExtensionByUrl } from '../src/api';
import type { AnalysisProgressEvent } from '../src/api';

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

  it('reads SSE progress events when onProgress is provided', async () => {
    const sseBody = [
      'event: progress\ndata: {"step":"resolving","message":"Resolving…","percent":10}\n\n',
      'event: progress\ndata: {"step":"downloading","message":"Downloading…","percent":20}\n\n',
      'event: progress\ndata: {"step":"complete","message":"Done.","percent":100}\n\n',
      `event: result\ndata: ${JSON.stringify(baseReport)}\n\n`
    ].join('');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sseBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }));

    const events: AnalysisProgressEvent[] = [];
    const report = await analyzeExtensionByUrl('https://example.com/extension.zip', (evt) => events.push(evt));

    expect(report.metadata.name).toBe('API Test Extension');
    expect(events.length).toBe(3);
    expect(events[0]?.step).toBe('resolving');
    expect(events[0]?.percent).toBe(10);
    expect(events[2]?.step).toBe('complete');
  });

  it('throws on SSE error event', async () => {
    const sseBody = [
      'event: progress\ndata: {"step":"resolving","message":"Resolving…","percent":10}\n\n',
      'event: error\ndata: {"error":"Download failed."}\n\n'
    ].join('');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sseBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }));

    await expect(
      analyzeExtensionById('abcdefghijklmnopabcdefghijklmnop', () => {})
    ).rejects.toThrow('Download failed.');
  });

  it('falls back to JSON parsing when server returns JSON despite SSE request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(baseReport), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));

    const report = await analyzeExtensionByUrl('https://example.com/extension.zip', () => {});
    expect(report.metadata.name).toBe('API Test Extension');
  });
});

