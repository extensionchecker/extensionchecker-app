import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { downloadPackage } from '../src/download';
import { readRequestTextWithinLimit } from '../src/bounded-stream-reader';

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

describe('bounded stream readers', () => {
  it('rejects request bodies that exceed the byte limit without relying on content-length', async () => {
    const largeChunk = new TextEncoder().encode('x'.repeat(20 * 1024));
    const request = new Request('https://scanner.test/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: streamFromChunks([largeChunk]),
      duplex: 'half'
    });

    await expect(
      readRequestTextWithinLimit(request, 16 * 1024, 'Analyze request body is too large.')
    ).rejects.toThrow(/too large/i);
  });

  it('reads small request bodies completely when they stay within the cap', async () => {
    const first = new TextEncoder().encode('{"source":');
    const second = new TextEncoder().encode('{"type":"id","value":"firefox:test-addon"}}');
    const request = new Request('https://scanner.test/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: streamFromChunks([first, second]),
      duplex: 'half'
    });

    const text = await readRequestTextWithinLimit(request, 16 * 1024, 'Analyze request body is too large.');
    expect(text).toContain('firefox:test-addon');
  });
});

describe('stream size enforcement in live paths', () => {
  it('rejects analyze requests whose streamed body exceeds the limit without a content-length header', async () => {
    const app = createApp({ securityConfig: { allowRequestsWithoutOrigin: true } });
    const largeBody = new TextEncoder().encode(JSON.stringify({
      source: { type: 'id', value: 'firefox:test-addon' },
      padding: 'x'.repeat(20 * 1024)
    }));

    const request = new Request('https://scanner.test/api/analyze', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'origin': 'http://localhost:5173'
      },
      body: streamFromChunks([largeBody]),
      duplex: 'half'
    });

    const response = await app.fetch(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'Analyze request body is too large.' });
  });

  it('rejects downloaded packages that exceed the cap while streaming without content-length', async () => {
    const firstChunk = new Uint8Array(700_000);
    const secondChunk = new Uint8Array(700_000);
    const fetchImpl = vi.fn(async () => new Response(streamFromChunks([firstChunk, secondChunk]), {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    await expect(
      downloadPackage(new URL('https://addons.mozilla.org/firefox/downloads/latest/test/addon-latest.xpi'), fetchImpl, 5_000, 1_000_000)
    ).rejects.toThrow(/size limit/i);
  });

  it('accepts downloaded packages that stay within the streamed byte cap', async () => {
    const firstChunk = new Uint8Array([1, 2, 3]);
    const secondChunk = new Uint8Array([4, 5, 6]);
    const fetchImpl = vi.fn(async () => new Response(streamFromChunks([firstChunk, secondChunk]), {
      status: 200,
      headers: { 'content-type': 'application/zip' }
    })) as typeof fetch;

    const downloaded = await downloadPackage(
      new URL('https://addons.mozilla.org/firefox/downloads/latest/test/addon-latest.xpi'),
      fetchImpl,
      5_000,
      1024
    );

    expect(new Uint8Array(downloaded.bytes)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });
});