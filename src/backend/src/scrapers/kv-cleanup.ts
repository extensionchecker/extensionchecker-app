/**
 * Scheduled KV cache cleanup - runs via a Cloudflare Cron Trigger.
 *
 * Why this exists even though we set expirationTtl on every write:
 *  - Belt-and-suspenders: any entry written without a TTL (manual admin inserts,
 *    code bugs, legacy entries from an older deploy) is pruned proactively.
 *  - TTL policy changes: if MAX_CACHE_AGE_MS is reduced, existing entries with
 *    the old (longer) TTL would linger until Cloudflare evicts them. This handler
 *    forces immediate removal based on the current policy.
 *  - Observability: logs how many entries were found and pruned each run.
 *
 * Normal path: Cloudflare auto-evicts entries at KV_TTL_SECONDS (100 days).
 * Our MAX_CACHE_AGE_MS (90 days) ensures we never read entries between
 * 90–100 days old. The scheduled handler removes them before that window.
 */

import { MAX_CACHE_AGE_MS } from './kv-cache';

/** KV list() returns up to 1 000 keys per call. We page through all of them. */
const KV_LIST_PAGE_SIZE = 1_000;

/** Key prefix shared by all store cache entries (from kv-cache.ts). */
const CACHE_KEY_PREFIX = 'store:';

type KvListResult = {
  keys: Array<{ name: string }>;
  list_complete: boolean;
  cursor?: string;
};

/**
 * Minimal KV namespace type needed for cleanup - same as in kv-cache.ts but
 * extended with `list` and `delete` (only needed in the scheduled handler).
 */
export type CleanupKvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KvListResult>;
};

type CleanupResult = {
  scanned: number;
  deleted: number;
  errors: number;
};

/**
 * Scans all `store:*` KV keys, reads each entry, and deletes any whose
 * `scrapedAt` timestamp exceeds MAX_CACHE_AGE_MS.
 *
 * This is O(n) in the number of cached extensions. At typical workloads
 * (thousands of extensions) this completes well within the Cron Trigger's
 * 30-second CPU budget.
 */
export async function pruneExpiredCacheEntries(
  kv: CleanupKvNamespace,
  nowMs: number = Date.now()
): Promise<CleanupResult> {
  let scanned = 0;
  let deleted = 0;
  let errors = 0;
  let cursor: string | undefined;
  let listComplete = false;

  while (!listComplete) {
    let page: KvListResult;
    try {
      page = await kv.list({
        prefix: CACHE_KEY_PREFIX,
        limit: KV_LIST_PAGE_SIZE,
        ...(cursor ? { cursor } : {})
      });
    } catch {
      // If listing fails, stop - don't risk partial deletion.
      console.error('[kv-cleanup] Failed to list KV keys; aborting cleanup run.');
      break;
    }

    for (const { name } of page.keys) {
      scanned++;
      try {
        const raw = await kv.get(name);
        if (!raw) {
          // Entry already expired/deleted by CF TTL - nothing to do.
          continue;
        }

        let entry: { scrapedAt?: string };
        try {
          entry = JSON.parse(raw) as { scrapedAt?: string };
        } catch {
          // Malformed entry - delete it.
          await kv.delete(name);
          deleted++;
          continue;
        }

        const scrapedAtMs = entry.scrapedAt ? Date.parse(entry.scrapedAt) : NaN;
        if (!Number.isFinite(scrapedAtMs)) {
          // No valid timestamp - delete.
          await kv.delete(name);
          deleted++;
          continue;
        }

        if (nowMs - scrapedAtMs > MAX_CACHE_AGE_MS) {
          await kv.delete(name);
          deleted++;
        }
      } catch {
        errors++;
      }
    }

    listComplete = page.list_complete;
    cursor = page.cursor;
  }

  console.error(`[kv-cleanup] Scanned ${scanned} entries, deleted ${deleted}, errors ${errors}.`);
  return { scanned, deleted, errors };
}
