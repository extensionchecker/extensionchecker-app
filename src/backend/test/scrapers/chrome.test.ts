import { describe, expect, it, vi } from 'vitest';
import { fetchChromeStoreData } from '../../src/scrapers/chrome';

function makeHtml(body: string): string {
  return `<html><head></head><body>${body}</body></html>`;
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function mockFetch(html: string, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  ) as unknown as typeof fetch;
}

describe('fetchChromeStoreData', () => {
  it('returns null for empty extensionId without calling fetch', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    expect(await fetchChromeStoreData('', fetchMock)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws a network error', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network failure'); }) as unknown as typeof fetch;
    expect(await fetchChromeStoreData('ecabifbgmdmgdllomnfinbmaellmclnh', fetchMock)).toBeNull();
  });

  it('returns null when response status is not OK', async () => {
    expect(await fetchChromeStoreData('extid', mockFetch('<html></html>', 404))).toBeNull();
  });

  it('returns null when HTML contains no rating or userCount signals', async () => {
    expect(await fetchChromeStoreData('extid', mockFetch(makeHtml('<p>No extension data</p>')))).toBeNull();
  });

  it('extracts rating and ratingCount from JSON-LD aggregateRating (string values)', async () => {
    const html = makeHtml(jsonLd({
      '@type': 'SoftwareApplication',
      aggregateRating: { ratingValue: '4.5', ratingCount: '1234' }
    }));
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    expect(result).toEqual({ rating: 4.5, ratingCount: 1234 });
  });

  it('extracts rating with numeric ratingValue (not just string)', async () => {
    const html = makeHtml(jsonLd({ aggregateRating: { ratingValue: 4, ratingCount: 50 } }));
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    expect(result?.rating).toBe(4);
  });

  it('uses reviewCount when ratingCount is absent', async () => {
    const html = makeHtml(jsonLd({ aggregateRating: { ratingValue: 3.8, reviewCount: '500' } }));
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    expect(result).toEqual({ rating: 3.8, ratingCount: 500 });
  });

  it('extracts userCount from JSON-LD interactionStatistic as single object', async () => {
    const html = makeHtml(jsonLd({
      '@type': 'SoftwareApplication',
      interactionStatistic: { userInteractionCount: '1500000' }
    }));
    expect(await fetchChromeStoreData('extid', mockFetch(html))).toEqual({ userCount: 1500000 });
  });

  it('extracts userCount from JSON-LD interactionStatistic as array', async () => {
    const html = makeHtml(jsonLd({
      interactionStatistic: [{ userInteractionCount: '42000' }]
    }));
    expect(await fetchChromeStoreData('extid', mockFetch(html))).toEqual({ userCount: 42000 });
  });

  it('extracts userCount from regex pattern matching userInteractionCount JSON in page text', async () => {
    const html = makeHtml('<script>var d = {"userInteractionCount": "99000"};</script>');
    expect(await fetchChromeStoreData('extid', mockFetch(html))).toEqual({ userCount: 99000 });
  });

  it('extracts userCount from "N+ users" page text pattern', async () => {
    expect(await fetchChromeStoreData('extid', mockFetch(makeHtml('<p>10,000+ users</p>')))).toEqual({ userCount: 10000 });
  });

  it('returns both rating and userCount when both JSON-LD signals are present', async () => {
    const html = makeHtml(jsonLd({
      aggregateRating: { ratingValue: '4.2', ratingCount: '200' },
      interactionStatistic: { userInteractionCount: '5000' }
    }));
    expect(await fetchChromeStoreData('extid', mockFetch(html))).toEqual({ rating: 4.2, ratingCount: 200, userCount: 5000 });
  });

  it('discards rating above 5 and keeps userCount from page text', async () => {
    const html = makeHtml(jsonLd({ aggregateRating: { ratingValue: '10', ratingCount: '100' } }) + '<p>5,000+ users</p>');
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    expect(result?.rating).toBeUndefined();
    expect(result?.userCount).toBe(5000);
  });

  it('discards negative rating', async () => {
    const html = makeHtml(jsonLd({ aggregateRating: { ratingValue: '-1' } }) + '<p>1,000+ users</p>');
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    expect(result?.rating).toBeUndefined();
    expect(result?.userCount).toBe(1000);
  });

  it('skips malformed JSON-LD blocks without throwing', async () => {
    const html = makeHtml('<script type="application/ld+json">NOT VALID {{{ JSON</script><p>3,000+ users</p>');
    expect(await fetchChromeStoreData('extid', mockFetch(html))).toEqual({ userCount: 3000 });
  });

  it('processes multiple JSON-LD blocks and uses the first valid aggregateRating', async () => {
    const html = makeHtml(
      '<script type="application/ld+json">INVALID</script>' +
      jsonLd({ aggregateRating: { ratingValue: '4.0', ratingCount: '100' } })
    );
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    expect(result?.rating).toBe(4.0);
  });

  it('interactionStatistic with no userInteractionCount returns undefined for that block', async () => {
    const html = makeHtml(jsonLd({ interactionStatistic: { somethingElse: '100' } }) + '<p>2,000+ users</p>');
    const result = await fetchChromeStoreData('extid', mockFetch(html));
    // Falls through to the page-text pattern
    expect(result?.userCount).toBe(2000);
  });

  it('fetches the correct Chrome Web Store URL with extensionId URL-encoded', async () => {
    const html = makeHtml(jsonLd({ aggregateRating: { ratingValue: '4.0', ratingCount: '10' } }));
    const fetchMock = mockFetch(html);
    await fetchChromeStoreData('testextid', fetchMock);
    const calledUrl = String((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('chromewebstore.google.com/detail/testextid');
  });

  it('returns null when response body text() read throws', async () => {
    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream({ start(controller) { controller.error(new Error('IO error')); } });
      return new Response(body as BodyInit, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;
    expect(await fetchChromeStoreData('extid', fetchMock)).toBeNull();
  });
});
