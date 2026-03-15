import { describe, expect, it, vi } from 'vitest';
import { fetchOperaStoreData } from '../../src/scrapers/opera';

function mockFetch(html: string, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  ) as unknown as typeof fetch;
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

describe('fetchOperaStoreData', () => {
  it('returns null for empty slug without calling fetch', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    expect(await fetchOperaStoreData('', fetchMock)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws a network error', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network error'); }) as unknown as typeof fetch;
    expect(await fetchOperaStoreData('ublock', fetchMock)).toBeNull();
  });

  it('returns null when response status is not OK', async () => {
    expect(await fetchOperaStoreData('ublock', mockFetch('<html></html>', 404))).toBeNull();
  });

  it('returns null when HTML has no extractable signals', async () => {
    expect(await fetchOperaStoreData('ublock', mockFetch('<html><body><p>Nothing useful</p></body></html>'))).toBeNull();
  });

  it('extracts rating and ratingCount from JSON-LD aggregateRating (string values)', async () => {
    const html = `<html>${jsonLd({
      '@type': 'SoftwareApplication',
      aggregateRating: { ratingValue: '4.6', ratingCount: '300' }
    })}</html>`;
    expect(await fetchOperaStoreData('ublock', mockFetch(html))).toEqual({ rating: 4.6, ratingCount: 300 });
  });

  it('uses reviewCount from JSON-LD when ratingCount is absent', async () => {
    const html = `<html>${jsonLd({ aggregateRating: { ratingValue: '3.5', reviewCount: '80' } })}</html>`;
    expect(await fetchOperaStoreData('ublock', mockFetch(html))).toEqual({ rating: 3.5, ratingCount: 80 });
  });

  it('extracts rating from schema.org microdata meta itemprop attribute', async () => {
    const html = '<html><body><meta itemprop="ratingValue" content="4.1"><meta itemprop="ratingCount" content="55"></body></html>';
    expect(await fetchOperaStoreData('ublock', mockFetch(html))).toEqual({ rating: 4.1, ratingCount: 55 });
  });

  it('extracts rating from microdata inline element (non-meta tag)', async () => {
    const html = '<html><body><span itemprop="ratingValue">4.3</span></body></html>';
    expect(await fetchOperaStoreData('ublock', mockFetch(html))).toEqual({ rating: 4.3 });
  });

  it('extracts ratingCount from microdata reviewCount fallback', async () => {
    const html = '<html><body><meta itemprop="ratingValue" content="3.9"><meta itemprop="reviewCount" content="22"></body></html>';
    const result = await fetchOperaStoreData('ublock', mockFetch(html));
    expect(result?.rating).toBe(3.9);
    expect(result?.ratingCount).toBe(22);
  });

  it('extracts userCount from "downloads" page text', async () => {
    expect(await fetchOperaStoreData('ublock', mockFetch('<html><body><p>50,000 Downloads</p></body></html>'))).toEqual({ userCount: 50000 });
  });

  it('extracts userCount from "users" page text', async () => {
    expect(await fetchOperaStoreData('ublock', mockFetch('<html><body><p>12,500 users</p></body></html>'))).toEqual({ userCount: 12500 });
  });

  it('extracts userCount from "installs" page text', async () => {
    expect(await fetchOperaStoreData('ublock', mockFetch('<html><body><p>3,000 installs</p></body></html>'))).toEqual({ userCount: 3000 });
  });

  it('discards rating above 5 and keeps userCount when it is present', async () => {
    const html = `<html>${jsonLd({ aggregateRating: { ratingValue: '6.0', ratingCount: '100' } })}<body><p>1,000 downloads</p></body></html>`;
    const result = await fetchOperaStoreData('ublock', mockFetch(html));
    expect(result?.rating).toBeUndefined();
    expect(result?.userCount).toBe(1000);
  });

  it('discards microdata rating out of range and returns null when no other signal', async () => {
    const html = '<html><body><meta itemprop="ratingValue" content="-5"></body></html>';
    expect(await fetchOperaStoreData('ublock', mockFetch(html))).toBeNull();
  });

  it('skips malformed JSON-LD blocks without throwing', async () => {
    const html = `<html><script type="application/ld+json">INVALID{{{</script><body><p>500 downloads</p></body></html>`;
    expect(await fetchOperaStoreData('ublock', mockFetch(html))).toEqual({ userCount: 500 });
  });

  it('prefers JSON-LD rating over microdata when both are present', async () => {
    const html = `<html>
      ${jsonLd({ aggregateRating: { ratingValue: '4.9', ratingCount: '10' } })}
      <body><meta itemprop="ratingValue" content="3.0"></body>
    </html>`;
    const result = await fetchOperaStoreData('ublock', mockFetch(html));
    expect(result?.rating).toBe(4.9);
  });

  it('falls back to microdata when JSON-LD has no aggregateRating', async () => {
    const html = `<html>
      ${jsonLd({ '@type': 'WebSite', name: 'Opera Add-ons' })}
      <body><meta itemprop="ratingValue" content="4.2"></body>
    </html>`;
    const result = await fetchOperaStoreData('ublock', mockFetch(html));
    expect(result?.rating).toBe(4.2);
  });

  it('constructs the correct Opera store URL with trailing slash', async () => {
    const html = `<html>${jsonLd({ aggregateRating: { ratingValue: '4.0' } })}</html>`;
    const fetchMock = mockFetch(html);
    await fetchOperaStoreData('my-ext', fetchMock);
    const calledUrl = String((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('addons.opera.com/extensions/details/my-ext/');
  });

  it('returns null when response body text() read throws', async () => {
    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream({ start(controller) { controller.error(new Error('IO error')); } });
      return new Response(body as BodyInit, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;
    expect(await fetchOperaStoreData('ublock', fetchMock)).toBeNull();
  });
});
