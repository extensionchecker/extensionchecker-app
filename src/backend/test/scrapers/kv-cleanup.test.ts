import { describe, expect, it, vi } from 'vitest';
import { pruneExpiredCacheEntries, type CleanupKvNamespace } from '../../src/scrapers/kv-cleanup';
import { MAX_CACHE_AGE_MS } from '../../src/scrapers/kv-cache';

// Fixed timestamp for deterministic age comparisons.
const NOW = 1_700_000_000_000;

function makeEntry(ageMs: number): string {
  return JSON.stringify({ scrapedAt: new Date(NOW - ageMs).toISOString(), data: { rating: 4.0 } });
}

/**
 * Constructs a simple in-memory CleanupKvNamespace with pre-populated entries.
 * The list() method returns all keys in a single page (list_complete: true).
 */
function makeKv(entries: Record<string, string>): CleanupKvNamespace {
  const store = { ...entries };
  return {
    async get(key: string) { return store[key] ?? null; },
    async put(key: string, value: string) { store[key] = value; },
    async delete(key: string) { delete store[key]; },
    async list({ prefix } = {}) {
      const keys = Object.keys(store)
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    }
  };
}

describe('pruneExpiredCacheEntries', () => {
  it('returns zero counts when the store is empty', async () => {
    const result = await pruneExpiredCacheEntries(makeKv({}), NOW);
    expect(result).toEqual({ scanned: 0, deleted: 0, errors: 0 });
  });

  it('deletes entries older than MAX_CACHE_AGE_MS', async () => {
    const kv = makeKv({ 'store:v1:chrome:old': makeEntry(MAX_CACHE_AGE_MS + 1) });
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('keeps entries within MAX_CACHE_AGE_MS', async () => {
    const kv = makeKv({ 'store:v1:chrome:fresh': makeEntry(1000) });
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it('deletes expired entries while keeping fresh ones', async () => {
    const kv = makeKv({
      'store:v1:chrome:old': makeEntry(MAX_CACHE_AGE_MS + 1000),
      'store:v1:chrome:fresh': makeEntry(1000)
    });
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('deletes entries with malformed JSON (unparseable)', async () => {
    const kv = makeKv({ 'store:v1:chrome:bad': 'NOT VALID JSON {{{{' });
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.deleted).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('deletes entries missing the scrapedAt field', async () => {
    const kv = makeKv({ 'store:v1:chrome:nodate': JSON.stringify({ data: {} }) });
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.deleted).toBe(1);
  });

  it('deletes entries where scrapedAt is not a valid date string', async () => {
    const kv = makeKv({ 'store:v1:chrome:baddate': JSON.stringify({ scrapedAt: 'not-a-date', data: {} }) });
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.deleted).toBe(1);
  });

  it('skips entries that kv.get() returns null for (already evicted by CF TTL)', async () => {
    const kv: CleanupKvNamespace = {
      async get() { return null; },
      async put() { /* noop */ },
      async delete() { /* noop */ },
      async list() {
        return { keys: [{ name: 'store:v1:chrome:ghostentry' }], list_complete: true };
      }
    };
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.scanned).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('stops listing and returns partial result when kv.list() throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kv: CleanupKvNamespace = {
      async get() { return null; },
      async put() { /* noop */ },
      async delete() { /* noop */ },
      async list() { throw new Error('list failure'); }
    };
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
    consoleSpy.mockRestore();
  });

  it('increments errors when per-key read throws', async () => {
    const kv: CleanupKvNamespace = {
      async get() { throw new Error('per-key KV read error'); },
      async put() { /* noop */ },
      async delete() { /* noop */ },
      async list() {
        return { keys: [{ name: 'store:v1:chrome:err' }], list_complete: true };
      }
    };
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(result.errors).toBe(1);
    expect(result.scanned).toBe(1);
  });

  it('pages through multiple list() calls using cursor', async () => {
    let callCount = 0;
    const kv: CleanupKvNamespace = {
      async get() { return makeEntry(MAX_CACHE_AGE_MS + 1000); },
      async put() { /* noop */ },
      async delete() { /* noop */ },
      async list({ cursor } = {}) {
        callCount++;
        if (callCount === 1) {
          // First page: not complete, returns a cursor.
          return { keys: [{ name: 'store:v1:chrome:page1' }], list_complete: false, cursor: 'cursor1' };
        }
        // Second page: complete.
        return { keys: [{ name: 'store:v1:chrome:page2' }], list_complete: true };
      }
    };
    const result = await pruneExpiredCacheEntries(kv, NOW);
    expect(callCount).toBe(2);
    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(2);
  });

  it('logs a summary after completion', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await pruneExpiredCacheEntries(makeKv({}), NOW);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[kv-cleanup]'));
    logSpy.mockRestore();
  });
});
