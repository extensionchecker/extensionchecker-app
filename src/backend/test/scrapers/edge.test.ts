import { describe, expect, it, vi } from 'vitest';
import { fetchEdgeStoreData } from '../../src/scrapers/edge';

/**
 * Builds a minimal Edge Add-ons page HTML shell with schema.org microdata
 * <meta> tags — matching the actual server-rendered HTML structure used since
 * the site migrated from Next.js SSR to a client-side SPA in early 2026.
 */
function withMicrodata(opts: {
  ratingValue?: number;
  ratingCount?: number;
  userInteractionCount?: number;
}): string {
  const { ratingValue, ratingCount, userInteractionCount } = opts;
  return `<!DOCTYPE html>
<html lang="en-US">
<head><meta charset="utf-8" /><title>Test Extension - Microsoft Edge Add-ons</title></head>
<body>
  <div id="root"></div>
  ${userInteractionCount !== undefined ? `
  <div itemscope itemtype="http://schema.org/WebApplication">
    <span itemProp="interactionStatistic" itemscope itemType="http://schema.org/InteractionCounter">
      <meta itemProp="userInteractionCount" content="${userInteractionCount}" />
    </span>
  </div>` : ''}
  ${ratingValue !== undefined || ratingCount !== undefined ? `
  <span itemprop="aggregateRating" itemscope itemtype="http://schema.org/AggregateRating">
    ${ratingValue !== undefined ? `<meta itemprop="ratingValue" content="${ratingValue}">` : ''}
    ${ratingCount !== undefined ? `<meta itemprop="ratingCount" content="${ratingCount}">` : ''}
  </span>` : ''}
</body>
</html>`;
}

function mockFetch(html: string, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  ) as unknown as typeof fetch;
}

describe('fetchEdgeStoreData', () => {
  it('returns null for empty extensionId without calling fetch', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    expect(await fetchEdgeStoreData('', fetchMock)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws a network error', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('network failure'); }) as unknown as typeof fetch;
    expect(await fetchEdgeStoreData('someextid', fetchMock)).toBeNull();
  });

  it('returns null when response status is not OK', async () => {
    expect(await fetchEdgeStoreData('someextid', mockFetch('<html></html>', 403))).toBeNull();
  });

  it('returns null when HTML has no microdata tags', async () => {
    expect(await fetchEdgeStoreData('someextid', mockFetch('<html><body><div id="root"></div></body></html>'))).toBeNull();
  });

  it('extracts ratingValue, ratingCount, and userInteractionCount from microdata', async () => {
    const html = withMicrodata({ ratingValue: 4.5, ratingCount: 2607, userInteractionCount: 14551241 });
    expect(await fetchEdgeStoreData('odfafepnkmbhccpbejgmiehpchacaeak', mockFetch(html))).toEqual({
      rating: 4.5,
      ratingCount: 2607,
      userCount: 14551241
    });
  });

  it('returns partial result when only ratingValue is present', async () => {
    const html = withMicrodata({ ratingValue: 3.9 });
    expect(await fetchEdgeStoreData('someextid', mockFetch(html))).toEqual({ rating: 3.9 });
  });

  it('returns partial result when only userInteractionCount is present', async () => {
    const html = withMicrodata({ userInteractionCount: 50000 });
    expect(await fetchEdgeStoreData('someextid', mockFetch(html))).toEqual({ userCount: 50000 });
  });

  it('returns partial result when only ratingCount is present', async () => {
    const html = withMicrodata({ ratingCount: 120 });
    expect(await fetchEdgeStoreData('someextid', mockFetch(html))).toEqual({ ratingCount: 120 });
  });

  it('returns null when ratingValue is out of the 0-5 range', async () => {
    const html = withMicrodata({ ratingValue: 9.9 });
    expect(await fetchEdgeStoreData('someextid', mockFetch(html))).toBeNull();
  });

  it('handles content-first attribute ordering in meta tags', async () => {
    const html = `<html><body>
      <meta content="4.2" itemprop="ratingValue">
      <meta content="300" itemprop="ratingCount">
    </body></html>`;
    expect(await fetchEdgeStoreData('someextid', mockFetch(html))).toEqual({ rating: 4.2, ratingCount: 300 });
  });

  it('handles mixed-case itemprop attribute (itemProp vs itemprop)', async () => {
    const html = `<html><body>
      <meta itemProp="ratingValue" content="4.0">
      <meta itemProp="userInteractionCount" content="100000">
    </body></html>`;
    expect(await fetchEdgeStoreData('someextid', mockFetch(html))).toEqual({ rating: 4.0, userCount: 100000 });
  });

  it('constructs the correct Edge store URL', async () => {
    const html = withMicrodata({ ratingValue: 4.0 });
    const fetchMock = mockFetch(html);
    await fetchEdgeStoreData('nffknjpglkklphnibdiadeeeeailfnog', fetchMock);
    const calledUrl = String((fetchMock as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('microsoftedge.microsoft.com/addons/detail/');
    expect(calledUrl).toContain('nffknjpglkklphnibdiadeeeeailfnog');
  });

  it('returns null when response body text() read throws', async () => {
    const fetchMock = vi.fn(async () => {
      const body = new ReadableStream({ start(controller) { controller.error(new Error('IO error')); } });
      return new Response(body as BodyInit, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as unknown as typeof fetch;
    expect(await fetchEdgeStoreData('someextid', fetchMock)).toBeNull();
  });
});
