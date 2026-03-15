/**
 * Unified store data dispatch - routes to the correct fetcher based on
 * the extension ecosystem, respects per-store feature flags, and uses a
 * KV-backed cache to survive scraper failures gracefully.
 *
 * Flow for each scrape-enabled ecosystem:
 *  1. Attempt a fresh scrape.
 *  2. If it succeeds  → write result to KV cache, return fresh data.
 *  3. If it fails     → check KV for a cached entry ≤ 90 days old.
 *     a. Cache hit    → return cached data with fromCache: true + age metadata.
 *     b. Cache miss   → return { attempted: true, data: null } (unavailable).
 *
 * Returns a StoreDataResult so the caller can distinguish:
 *   - No scrape attempted       (file upload, disabled scraper, unknown ecosystem)
 *   - Fresh scrape succeeded    (data is non-null, fromCache: false)
 *   - Cache fallback used       (data is non-null, fromCache: true)
 *   - Completely unavailable    (data: null)
 */

import { fetchAmoStoreData } from '../store-metadata';
import { fetchChromeStoreData } from './chrome';
import { fetchEdgeStoreData } from './edge';
import { fetchOperaStoreData } from './opera';
import { readFromCache, writeToCache, type KvNamespace } from './kv-cache';
import type { ScraperConfig } from './scraper-config';
import type { ScrapedStoreData, StoreDataResult } from './types';

type SupportedEcosystem = 'firefox' | 'chrome' | 'edge' | 'opera';

function extractEcosystemAndId(
  sourceValue: string
): { ecosystem: SupportedEcosystem; id: string } | null {
  const match = /^(firefox|chrome|edge|opera):(.+)$/i.exec(sourceValue);
  if (!match) return null;

  const ecosystem = match[1]!.toLowerCase() as SupportedEcosystem;
  const id = match[2]!.trim();
  return id.length > 0 ? { ecosystem, id } : null;
}

type ScraperFn = (id: string, fetchImpl: typeof fetch, timeoutMs: number) => Promise<ScrapedStoreData | null>;

/**
 * Attempts a fresh scrape, then falls back to KV cache on failure.
 * Writes successful results back to KV unconditionally.
 */
async function scrapeWithCacheFallback(
  ecosystem: string,
  id: string,
  scraperFn: ScraperFn,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  kv: KvNamespace | null | undefined
): Promise<StoreDataResult> {
  // 1. Try fresh scrape.
  const freshData = await scraperFn(id, fetchImpl, timeoutMs);

  if (freshData !== null) {
    // Scrape succeeded - update cache and return fresh data.
    await writeToCache(kv, ecosystem, id, freshData);
    return { attempted: true, data: freshData, fromCache: false };
  }

  // 2. Scrape failed - check for a cached fallback.
  const cached = await readFromCache(kv, ecosystem, id);
  if (cached.hit) {
    return {
      attempted: true,
      data: cached.data,
      fromCache: true,
      scrapedAt: cached.scrapedAt,
      cacheAgeMs: cached.ageMs
    };
  }

  // 3. Nothing available.
  return { attempted: true, data: null };
}

/**
 * Dispatches a store metadata fetch based on the source `id` value and
 * the runtime scraper feature-flag configuration.
 *
 * @param sourceValue  The `source.value` string from an `AnalysisSource` of
 *                     type `'id'`, e.g. `"chrome:aeblfdkhhhdcdj..."`.
 * @param fetchImpl    The `fetch` implementation to use (injectable for tests).
 * @param timeoutMs    Max milliseconds before the fetch is aborted.
 * @param config       Per-store enable/disable flags.
 * @param kv           Optional KV namespace for caching. When absent, no cache
 *                     is used - scrape failures produce "unavailable" immediately.
 */
export async function dispatchStoreDataFetch(
  sourceValue: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  config: ScraperConfig,
  kv?: KvNamespace | null
): Promise<StoreDataResult> {
  const parsed = extractEcosystemAndId(sourceValue);
  if (!parsed) return { attempted: false };

  const { ecosystem, id } = parsed;

  switch (ecosystem) {
    case 'firefox': {
      // AMO has a public REST API - always attempt, use same cache layer.
      return scrapeWithCacheFallback(
        'firefox', id,
        (addonId, fi, tms) => fetchAmoStoreData(addonId, fi, tms),
        fetchImpl, timeoutMs, kv
      );
    }

    case 'chrome': {
      if (!config.chromeEnabled) return { attempted: false };
      return scrapeWithCacheFallback('chrome', id, fetchChromeStoreData, fetchImpl, timeoutMs, kv);
    }

    case 'edge': {
      if (!config.edgeEnabled) return { attempted: false };
      return scrapeWithCacheFallback('edge', id, fetchEdgeStoreData, fetchImpl, timeoutMs, kv);
    }

    case 'opera': {
      if (!config.operaEnabled) return { attempted: false };
      return scrapeWithCacheFallback('opera', id, fetchOperaStoreData, fetchImpl, timeoutMs, kv);
    }
  }
}
