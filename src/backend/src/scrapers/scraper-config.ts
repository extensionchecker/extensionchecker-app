/**
 * Feature-flag configuration for per-store HTML scrapers.
 *
 * Each scraper can be independently disabled via environment variable.
 * Defaults to enabled — set to "false", "0", or "no" to disable a store.
 *
 * Why you might disable a scraper:
 *  - The store has changed its page structure and the scraper is returning garbage.
 *  - The Cloudflare edge IPs have been rate-limited by the store.
 *  - You want to reduce outbound request volume during a traffic spike.
 *
 * Disabling a scraper causes that store to fall back to manifest-only scoring
 * (StoreDataResult.attempted = false), NOT to the "unavailable" UI state.
 * The "unavailable" state is reserved for cases where scraping was attempted
 * but failed at runtime.
 */

export type ScraperEnv = {
  SCRAPER_CHROME_ENABLED?: string;
  SCRAPER_EDGE_ENABLED?: string;
  SCRAPER_OPERA_ENABLED?: string;
};

export type ScraperConfig = {
  chromeEnabled: boolean;
  edgeEnabled: boolean;
  operaEnabled: boolean;
};

function parseFlag(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return defaultValue;
}

export function buildScraperConfig(env?: ScraperEnv): ScraperConfig {
  return {
    chromeEnabled: parseFlag(env?.SCRAPER_CHROME_ENABLED, true),
    edgeEnabled:   parseFlag(env?.SCRAPER_EDGE_ENABLED,   true),
    operaEnabled:  parseFlag(env?.SCRAPER_OPERA_ENABLED,  true)
  };
}
