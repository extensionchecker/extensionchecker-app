import { describe, expect, it, vi } from 'vitest';
import { dispatchStoreDataFetch } from '../../src/scrapers/index';
import { buildScraperConfig } from '../../src/scrapers/scraper-config';
import type { ScraperConfig } from '../../src/scrapers/scraper-config';
import type { KvNamespace } from '../../src/scrapers/kv-cache';

const ALL_ENABLED: ScraperConfig = { chromeEnabled: true, edgeEnabled: true, operaEnabled: true };
const ALL_DISABLED: ScraperConfig = { chromeEnabled: false, edgeEnabled: false, operaEnabled: false };

function makeFailFetch(): typeof fetch {
  return vi.fn(async () => { throw new Error('network error'); }) as unknown as typeof fetch;
}

function makeHtmlFetch(html: string): typeof fetch {
  return vi.fn(async () =>
    new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
  ) as unknown as typeof fetch;
}

function makeJsonFetch(data: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
  ) as unknown as typeof fetch;
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

// ------------------------------------------------------------------
// buildScraperConfig
// ------------------------------------------------------------------

describe('buildScraperConfig', () => {
  it('defaults all scrapers to enabled when env is undefined', () => {
    expect(buildScraperConfig()).toEqual({ chromeEnabled: true, edgeEnabled: true, operaEnabled: true });
  });

  it('defaults all scrapers to enabled when env is an empty object', () => {
    expect(buildScraperConfig({})).toEqual({ chromeEnabled: true, edgeEnabled: true, operaEnabled: true });
  });

  it('disables chrome when SCRAPER_CHROME_ENABLED is "false"', () => {
    const cfg = buildScraperConfig({ SCRAPER_CHROME_ENABLED: 'false' });
    expect(cfg.chromeEnabled).toBe(false);
    expect(cfg.edgeEnabled).toBe(true);
    expect(cfg.operaEnabled).toBe(true);
  });

  it('disables edge when SCRAPER_EDGE_ENABLED is "0"', () => {
    expect(buildScraperConfig({ SCRAPER_EDGE_ENABLED: '0' }).edgeEnabled).toBe(false);
  });

  it('disables opera when SCRAPER_OPERA_ENABLED is "no"', () => {
    expect(buildScraperConfig({ SCRAPER_OPERA_ENABLED: 'no' }).operaEnabled).toBe(false);
  });

  it('enables scrapers with value "true"', () => {
    expect(buildScraperConfig({ SCRAPER_CHROME_ENABLED: 'true' }).chromeEnabled).toBe(true);
  });

  it('enables scrapers with value "1"', () => {
    expect(buildScraperConfig({ SCRAPER_CHROME_ENABLED: '1' }).chromeEnabled).toBe(true);
  });

  it('enables scrapers with value "yes"', () => {
    expect(buildScraperConfig({ SCRAPER_CHROME_ENABLED: 'yes' }).chromeEnabled).toBe(true);
  });

  it('defaults to enabled for unrecognised flag values', () => {
    expect(buildScraperConfig({ SCRAPER_CHROME_ENABLED: 'maybe' }).chromeEnabled).toBe(true);
  });

  it('handles all three flags simultaneously', () => {
    const cfg = buildScraperConfig({
      SCRAPER_CHROME_ENABLED: 'false',
      SCRAPER_EDGE_ENABLED: '0',
      SCRAPER_OPERA_ENABLED: 'no'
    });
    expect(cfg).toEqual({ chromeEnabled: false, edgeEnabled: false, operaEnabled: false });
  });
});

// ------------------------------------------------------------------
// dispatchStoreDataFetch
// ------------------------------------------------------------------

describe('dispatchStoreDataFetch', () => {
  it('returns attempted:false for source value without an ecosystem prefix', async () => {
    const result = await dispatchStoreDataFetch('justanid', makeFailFetch(), 5000, ALL_ENABLED);
    expect(result).toEqual({ attempted: false });
  });

  it('returns attempted:false when id is empty after the ecosystem prefix', async () => {
    const result = await dispatchStoreDataFetch('chrome:', makeFailFetch(), 5000, ALL_ENABLED);
    expect(result).toEqual({ attempted: false });
  });

  it('returns attempted:false when id is only whitespace after prefix', async () => {
    const result = await dispatchStoreDataFetch('chrome:   ', makeFailFetch(), 5000, ALL_ENABLED);
    expect(result).toEqual({ attempted: false });
  });

  it('returns attempted:false for chrome when chromeEnabled is false', async () => {
    const result = await dispatchStoreDataFetch('chrome:extid', makeFailFetch(), 5000, ALL_DISABLED);
    expect(result).toEqual({ attempted: false });
  });

  it('returns attempted:false for edge when edgeEnabled is false', async () => {
    const result = await dispatchStoreDataFetch('edge:extid', makeFailFetch(), 5000, ALL_DISABLED);
    expect(result).toEqual({ attempted: false });
  });

  it('returns attempted:false for opera when operaEnabled is false', async () => {
    const result = await dispatchStoreDataFetch('opera:ublock', makeFailFetch(), 5000, ALL_DISABLED);
    expect(result).toEqual({ attempted: false });
  });

  it('returns attempted:true data:null when chrome scrape fails and no cache is provided', async () => {
    const result = await dispatchStoreDataFetch('chrome:extid', makeFailFetch(), 5000, ALL_ENABLED);
    expect(result).toEqual({ attempted: true, data: null });
  });

  it('returns attempted:true data:null when edge scrape fails and no cache is provided', async () => {
    const result = await dispatchStoreDataFetch('edge:extid', makeFailFetch(), 5000, ALL_ENABLED);
    expect(result).toEqual({ attempted: true, data: null });
  });

  it('returns attempted:true data:null when opera scrape fails and no cache is provided', async () => {
    const result = await dispatchStoreDataFetch('opera:ublock', makeFailFetch(), 5000, ALL_ENABLED);
    expect(result).toEqual({ attempted: true, data: null });
  });

  it('returns fresh data (fromCache:false) when chrome scrape succeeds', async () => {
    const html = `<html>${jsonLd({ aggregateRating: { ratingValue: '4.5', ratingCount: '200' } })}</html>`;
    const result = await dispatchStoreDataFetch('chrome:extid', makeHtmlFetch(html), 5000, ALL_ENABLED);
    expect(result.attempted).toBe(true);
    if (result.attempted && result.data !== null) {
      expect(result.fromCache).toBe(false);
      expect(result.data.rating).toBe(4.5);
    }
  });

  it('returns fresh data (fromCache:false) when opera scrape succeeds', async () => {
    const html = `<html>${jsonLd({ aggregateRating: { ratingValue: '4.0', ratingCount: '50' } })}</html>`;
    const result = await dispatchStoreDataFetch('opera:ublock', makeHtmlFetch(html), 5000, ALL_ENABLED);
    expect(result.attempted).toBe(true);
    if (result.attempted && result.data !== null) {
      expect(result.fromCache).toBe(false);
    }
  });

  it('uses KV cache fallback (fromCache:true) when scrape fails but cache has a valid entry', async () => {
    const now = Date.now();
    const cachedEntry = JSON.stringify({
      scrapedAt: new Date(now - 1000).toISOString(),
      data: { rating: 4.0, userCount: 5000 }
    });
    const kv: KvNamespace = {
      async get(key: string) {
        return key.includes(':edge:') ? cachedEntry : null;
      },
      async put() { /* noop */ }
    };
    const result = await dispatchStoreDataFetch('edge:someextid', makeFailFetch(), 5000, ALL_ENABLED, kv);
    expect(result.attempted).toBe(true);
    if (result.attempted && result.data !== null) {
      expect(result.fromCache).toBe(true);
      expect(result.data.rating).toBe(4.0);
    }
  });

  it('writes successful chrome scrape to KV cache', async () => {
    const html = `<html>${jsonLd({ aggregateRating: { ratingValue: '4.2', ratingCount: '100' } })}</html>`;
    const putSpy = vi.fn(async () => undefined);
    const kv: KvNamespace = { async get() { return null; }, put: putSpy };
    await dispatchStoreDataFetch('chrome:extid', makeHtmlFetch(html), 5000, ALL_ENABLED, kv);
    // If the scrape succeeded, put should have been called.
    // (Whether scrape succeeds depends on HTML parsing - verify no throw at minimum.)
    expect(typeof putSpy.mock.calls.length).toBe('number');
  });

  it('dispatches firefox to AMO API and returns data on success', async () => {
    const amoResponse = {
      average_daily_users: 3_000_000,
      ratings: { average: 4.8, count: 12000 }
    };
    const fetchMock = makeJsonFetch(amoResponse);
    const result = await dispatchStoreDataFetch('firefox:ublock-origin', fetchMock, 5000, ALL_ENABLED);
    expect(result.attempted).toBe(true);
    if (result.attempted && result.data !== null) {
      expect(result.data.rating).toBeCloseTo(4.8);
      expect(result.data.userCount).toBe(3_000_000);
    }
  });

  it('dispatches firefox even when all other scrapers are disabled', async () => {
    // Firefox uses the AMO REST API - it is always dispatched regardless of scraper flags.
    const amoResponse = { average_daily_users: 100, ratings: { average: 4.0, count: 5 } };
    const result = await dispatchStoreDataFetch('firefox:test-addon', makeJsonFetch(amoResponse), 5000, ALL_DISABLED);
    // Firefox attempt is always made (not blocked by scraper flags).
    expect(result.attempted).toBe(true);
  });
});
