import { createApp } from './app';
import type { BackendSecurityEnv } from './security-config';
import type { CleanupKvNamespace } from './scrapers/kv-cleanup';
import { pruneExpiredCacheEntries } from './scrapers/kv-cleanup';

/**
 * Cloudflare Worker environment bindings.
 * KV is optional so the Worker degrades gracefully when the binding is absent
 * (local dev via Miniflare without a KV namespace configured, or deployments
 * that choose not to opt in to the cache layer).
 */
export type WorkerEnv = BackendSecurityEnv & {
  /** KV namespace bound in wrangler.toml as STORE_METADATA_CACHE. */
  STORE_METADATA_CACHE?: CleanupKvNamespace;
};

let cachedApp: ReturnType<typeof createApp> | null = null;
let cachedConfigSignature: string | null = null;

function securitySignature(env: BackendSecurityEnv): string {
  return JSON.stringify({
    origins: env.API_ALLOWED_ORIGINS ?? '',
    rpmIp: env.API_RATE_LIMIT_PER_MINUTE_PER_IP ?? '',
    rpdIp: env.API_RATE_LIMIT_PER_DAY_PER_IP ?? '',
    rpdGlobal: env.API_RATE_LIMIT_GLOBAL_PER_DAY ?? '',
    upstreamTimeoutMs: env.API_UPSTREAM_TIMEOUT_MS ?? '',
    allowWithoutOrigin: env.API_ALLOW_REQUESTS_WITHOUT_ORIGIN ?? '',
    hasToken: Boolean(env.API_ACCESS_TOKEN && env.API_ACCESS_TOKEN.trim().length > 0),
    chromeEnabled: env.SCRAPER_CHROME_ENABLED ?? '',
    edgeEnabled: env.SCRAPER_EDGE_ENABLED ?? '',
    operaEnabled: env.SCRAPER_OPERA_ENABLED ?? ''
  });
}

export default {
  fetch(request: Request, env: WorkerEnv) {
    const signature = securitySignature(env);
    if (!cachedApp || signature !== cachedConfigSignature) {
      cachedApp = createApp({ env, kv: env.STORE_METADATA_CACHE ?? null });
      cachedConfigSignature = signature;
    }

    return cachedApp.fetch(request);
  },

  /**
   * Scheduled Cron Trigger handler - prunes KV cache entries that have
   * exceeded MAX_CACHE_AGE_MS. Cloudflare evicts entries after their KV TTL,
   * but this handles belt-and-suspenders cleanup and policy change roll-overs.
   *
   * Configure in wrangler.toml:
   *   [[triggers]]
   *   crons = ["0 3 * * *"]   # 3 AM UTC daily
   */
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, ctx: ExecutionContext) {
    if (!env.STORE_METADATA_CACHE) {
      console.error('[kv-cleanup] No KV binding - skipping scheduled cleanup.');
      return;
    }
    ctx.waitUntil(pruneExpiredCacheEntries(env.STORE_METADATA_CACHE));
  }
};

