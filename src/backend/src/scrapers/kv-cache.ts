/**
 * KV-backed cache for browser extension store metadata.
 *
 * Cache entries are keyed by `store:v1:{ecosystem}:{extensionId}` so that:
 *  - Entries are namespaced by store (no cross-store collisions for same ID).
 *  - A schema change can invalidate all entries by bumping `v1` to `v2`.
 *
 * Cache freshness tiers:
 *  - < FRESH_THRESHOLD_MS (7 days)   → used transparently, no UI note.
 *  - ≤ MAX_CACHE_AGE_MS  (90 days)   → used with a "cached · X days ago" note.
 *  - > MAX_CACHE_AGE_MS              → treated as expired (same as miss).
 *
 * The KV binding is optional. When absent (local dev, file uploads), all
 * operations are no-ops and the caller falls back to manifest-only scoring.
 */

import type { ScrapedStoreData } from './types';

/** Version tag - increment to invalidate all existing cache entries. */
const CACHE_KEY_VERSION = 'v1';

/** Duration in ms after which cache is used with a display note. */
export const FRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1_000; // 7 days

/** Maximum age in ms before a cache entry is considered too stale to use. */
export const MAX_CACHE_AGE_MS = 90 * 24 * 60 * 60 * 1_000; // 90 days

/** KV entry TTL - slightly longer than max age so CF doesn't evict before we do. */
const KV_TTL_SECONDS = 100 * 24 * 60 * 60; // 100 days

type CacheEntry = {
  scrapedAt: string; // ISO 8601
  data: ScrapedStoreData;
};

type CacheReadResult =
  | { hit: false }
  | { hit: true; data: ScrapedStoreData; scrapedAt: string; ageMs: number };

/**
 * Minimal interface that covers both real Cloudflare KV namespaces and
 * test doubles - avoids importing Cloudflare-specific types into tests.
 */
export type KvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

function buildCacheKey(ecosystem: string, extensionId: string): string {
  // Normalise extension ID to lowercase so Chrome IDs (always lowercase in
  // practice) don't produce duplicate cache entries.
  return `store:${CACHE_KEY_VERSION}:${ecosystem}:${extensionId.toLowerCase()}`;
}

export async function readFromCache(
  kv: KvNamespace | null | undefined,
  ecosystem: string,
  extensionId: string,
  nowMs: number = Date.now()
): Promise<CacheReadResult> {
  if (!kv) return { hit: false };

  const key = buildCacheKey(ecosystem, extensionId);
  let raw: string | null;
  try {
    raw = await kv.get(key);
  } catch {
    // KV errors are non-fatal - treat as a miss.
    return { hit: false };
  }

  if (!raw) return { hit: false };

  let entry: CacheEntry;
  try {
    entry = JSON.parse(raw) as CacheEntry;
    if (!entry.scrapedAt || entry.data === null || typeof entry.data !== 'object') return { hit: false };
  } catch {
    return { hit: false };
  }

  const scrapedAtMs = Date.parse(entry.scrapedAt);
  if (!Number.isFinite(scrapedAtMs)) return { hit: false };

  const ageMs = nowMs - scrapedAtMs;
  if (ageMs > MAX_CACHE_AGE_MS) return { hit: false }; // expired

  return { hit: true, data: entry.data, scrapedAt: entry.scrapedAt, ageMs };
}

export async function writeToCache(
  kv: KvNamespace | null | undefined,
  ecosystem: string,
  extensionId: string,
  data: ScrapedStoreData
): Promise<void> {
  if (!kv) return;

  const key = buildCacheKey(ecosystem, extensionId);
  const entry: CacheEntry = {
    scrapedAt: new Date().toISOString(),
    data
  };

  try {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: KV_TTL_SECONDS });
  } catch {
    // Cache write failures are never fatal.
  }
}
