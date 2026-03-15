/**
 * Shared types used by all browser extension store scrapers.
 *
 * All fields are optional - individual scrapers may only be able to recover
 * a subset of signals depending on what the store page exposes, and partial
 * data is still useful for trust scoring.
 */

export type ScrapedStoreData = {
  rating?: number;
  ratingCount?: number;
  userCount?: number;
};

/**
 * Discriminated union expressing whether store data retrieval was attempted
 * and, if so, whether it succeeded.
 *
 * - `attempted: false`
 *     No scraping was attempted (file upload, Safari, disabled scraper).
 *     Scoring falls back to manifest-only with no UI note about unavailability.
 *
 * - `attempted: true, data: non-null, fromCache: false`
 *     Fresh scrape succeeded. Data feeds composite scoring transparently.
 *
 * - `attempted: true, data: non-null, fromCache: true`
 *     Fresh scrape failed, but a valid KV cache entry was found as fallback.
 *     Scoring uses cached data; UI shows a "cached · X days ago" note.
 *     `scrapedAt` is the ISO 8601 timestamp of the original successful scrape.
 *     `cacheAgeMs` is the age of the cached entry in milliseconds.
 *
 * - `attempted: true, data: null`
 *     Scraping failed and no usable cache entry exists.
 *     Scoring falls back to manifest-only; UI shows a gray "Unavailable" donut.
 */
export type StoreDataResult =
  | { attempted: false }
  | { attempted: true; data: ScrapedStoreData; fromCache: false }
  | { attempted: true; data: ScrapedStoreData; fromCache: true; scrapedAt: string; cacheAgeMs: number }
  | { attempted: true; data: null };
