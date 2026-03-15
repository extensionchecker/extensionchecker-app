import type { SecurityConfig } from './security';
import type { ScraperConfig } from './scrapers/scraper-config';
import type { KvNamespace } from './scrapers/kv-cache';

/**
 * Runtime dependencies shared by all route handler factories.
 *
 * Values are resolved once at app-creation time so handler logic stays free of
 * Hono's `CreateAppOptions` concerns and remains independently testable.
 */
export type RouteDeps = {
  fetchImpl: typeof fetch;
  securityConfig: SecurityConfig;
  scraperConfig: ScraperConfig;
  kv: KvNamespace | null;
};
