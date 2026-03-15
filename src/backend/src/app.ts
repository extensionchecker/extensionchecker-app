import { Hono } from 'hono';
import {
  InMemoryRateLimiter,
  buildSecurityConfig,
  mergeSecurityConfig,
  type BackendSecurityEnv,
  type SecurityConfigInput
} from './security';
import { buildScraperConfig, type ScraperConfig } from './scrapers/scraper-config';
import type { KvNamespace } from './scrapers/kv-cache';
import { registerSecurityHeaders, registerApiMiddleware } from './middleware';
import type { RouteDeps } from './route-deps';
import { registerAnalyzeRoute } from './route-analyze';
import { registerUploadRoute } from './route-upload';

export type CreateAppOptions = {
  securityConfig?: SecurityConfigInput;
  fetchImpl?: typeof fetch;
  now?: () => number;
  env?: BackendSecurityEnv;
  /** Override scraper feature flags (useful in tests without setting env strings). */
  scraperConfig?: ScraperConfig;
  /** Optional KV namespace for caching scraped store metadata. */
  kv?: KvNamespace | null;
};

/**
 * Creates and configures the Hono application.
 *
 * This factory is the single composition root for the backend: it wires
 * middleware, security, and route handlers together and returns the app.
 * All business logic lives in the individual route modules.
 */
export function createApp(options: CreateAppOptions = {}): Hono {
  const securityConfig = mergeSecurityConfig(buildSecurityConfig(options.env), options.securityConfig);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const rateLimiter = new InMemoryRateLimiter();
  const scraperConfig = options.scraperConfig ?? buildScraperConfig(options.env);
  const kv = options.kv ?? null;
  const app = new Hono();

  app.onError((error, context) => {
    console.error('Unhandled backend error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return context.json({ error: message }, 500);
  });

  registerSecurityHeaders(app);
  registerApiMiddleware(app, securityConfig, rateLimiter, now);

  app.get('/health', (context) => context.json({ status: 'ok' }));

  const deps: RouteDeps = { fetchImpl, securityConfig, scraperConfig, kv };
  registerAnalyzeRoute(app, deps);
  registerUploadRoute(app);

  return app;
}
