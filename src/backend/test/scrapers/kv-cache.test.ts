import { describe, expect, it, vi } from 'vitest';
import {
  readFromCache,
  writeToCache,
  FRESH_THRESHOLD_MS,
  MAX_CACHE_AGE_MS,
  type KvNamespace
} from '../../src/scrapers/kv-cache';

const SAMPLE_DATA = { rating: 4.5, ratingCount: 100, userCount: 5000 };

// Fixed timestamp for deterministic tests.
const NOW = 1_700_000_000_000;

function makeEntry(ageMs: number, data = SAMPLE_DATA): string {
  return JSON.stringify({ scrapedAt: new Date(NOW - ageMs).toISOString(), data });
}

function makeKv(stored: Record<string, string> = {}): KvNamespace {
  const store = { ...stored };
  return {
    async get(key: string) { return store[key] ?? null; },
    async put(key: string, value: string) { store[key] = value; }
  };
}

describe('readFromCache', () => {
  it('returns miss when kv is null', async () => {
    expect(await readFromCache(null, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when kv is undefined', async () => {
    expect(await readFromCache(undefined, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when key does not exist in KV', async () => {
    expect(await readFromCache(makeKv(), 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when KV.get() throws', async () => {
    const kv: KvNamespace = {
      async get() { throw new Error('KV unavailable'); },
      async put() { /* noop */ }
    };
    expect(await readFromCache(kv, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when stored value is malformed JSON', async () => {
    const kv = makeKv({ 'store:v1:chrome:extid': 'INVALID JSON{' });
    expect(await readFromCache(kv, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when stored entry lacks scrapedAt field', async () => {
    const kv = makeKv({ 'store:v1:chrome:extid': JSON.stringify({ data: SAMPLE_DATA }) });
    expect(await readFromCache(kv, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when stored entry has non-object data field', async () => {
    const kv = makeKv({ 'store:v1:chrome:extid': JSON.stringify({ scrapedAt: new Date(NOW).toISOString(), data: null }) });
    expect(await readFromCache(kv, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when scrapedAt is not a valid date string', async () => {
    const kv = makeKv({ 'store:v1:chrome:extid': JSON.stringify({ scrapedAt: 'not-a-date', data: SAMPLE_DATA }) });
    expect(await readFromCache(kv, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns miss when entry is older than MAX_CACHE_AGE_MS', async () => {
    const kv = makeKv({ 'store:v1:chrome:extid': makeEntry(MAX_CACHE_AGE_MS + 1) });
    expect(await readFromCache(kv, 'chrome', 'extid', NOW)).toEqual({ hit: false });
  });

  it('returns hit for a fresh entry (within FRESH_THRESHOLD_MS)', async () => {
    const oneDay = 24 * 60 * 60 * 1000;
    const kv = makeKv({ 'store:v1:chrome:extid': makeEntry(oneDay) });
    const result = await readFromCache(kv, 'chrome', 'extid', NOW);
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.data).toEqual(SAMPLE_DATA);
      expect(result.ageMs).toBe(oneDay);
    }
  });

  it('returns hit for an entry at exactly the MAX_CACHE_AGE_MS boundary', async () => {
    const kv = makeKv({ 'store:v1:chrome:extid': makeEntry(MAX_CACHE_AGE_MS) });
    const result = await readFromCache(kv, 'chrome', 'extid', NOW);
    expect(result.hit).toBe(true);
  });

  it('returns hit for a stale-but-valid entry (between FRESH_THRESHOLD_MS and MAX_CACHE_AGE_MS)', async () => {
    const staleAge = FRESH_THRESHOLD_MS + 1000;
    const kv = makeKv({ 'store:v1:edge:extid': makeEntry(staleAge) });
    const result = await readFromCache(kv, 'edge', 'extid', NOW);
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.ageMs).toBe(staleAge);
      expect(result.scrapedAt).toBe(new Date(NOW - staleAge).toISOString());
    }
  });

  it('normalises extensionId to lowercase when building the cache key', async () => {
    const kv = makeKv({ 'store:v1:chrome:abcdef': makeEntry(1000) });
    // Lookup with uppercase ID should still hit the lowercase key.
    const result = await readFromCache(kv, 'chrome', 'ABCDEF', NOW);
    expect(result.hit).toBe(true);
  });

  it('uses different namespaces for different ecosystems (no cross-store collisions)', async () => {
    const kv = makeKv({
      'store:v1:chrome:extid': makeEntry(1000),
      'store:v1:edge:extid': makeEntry(MAX_CACHE_AGE_MS + 1) // expired
    });
    expect((await readFromCache(kv, 'chrome', 'extid', NOW)).hit).toBe(true);
    expect((await readFromCache(kv, 'edge', 'extid', NOW)).hit).toBe(false);
  });
});

describe('writeToCache', () => {
  it('does nothing when kv is null without throwing', async () => {
    await expect(writeToCache(null, 'chrome', 'extid', SAMPLE_DATA)).resolves.toBeUndefined();
  });

  it('does nothing when kv is undefined without throwing', async () => {
    await expect(writeToCache(undefined, 'chrome', 'extid', SAMPLE_DATA)).resolves.toBeUndefined();
  });

  it('writes entry with correct key format and lowercased extensionId', async () => {
    const putSpy = vi.fn(async () => undefined);
    const kv: KvNamespace = { get: async () => null, put: putSpy };
    await writeToCache(kv, 'chrome', 'MyExtId', SAMPLE_DATA);
    expect(putSpy).toHaveBeenCalledOnce();
    const [key, value] = putSpy.mock.calls[0] as [string, string, unknown];
    expect(key).toBe('store:v1:chrome:myextid');
    const parsed = JSON.parse(value) as { scrapedAt: string; data: typeof SAMPLE_DATA };
    expect(parsed.data).toEqual(SAMPLE_DATA);
    expect(typeof parsed.scrapedAt).toBe('string');
    expect(new Date(parsed.scrapedAt).getTime()).toBeGreaterThan(0);
  });

  it('passes an expirationTtl option to kv.put()', async () => {
    const putSpy = vi.fn(async () => undefined);
    const kv: KvNamespace = { get: async () => null, put: putSpy };
    await writeToCache(kv, 'chrome', 'extid', SAMPLE_DATA);
    const options = putSpy.mock.calls[0]?.[2] as { expirationTtl?: number } | undefined;
    expect(options?.expirationTtl).toBeGreaterThan(0);
  });

  it('is non-fatal when kv.put() throws', async () => {
    const kv: KvNamespace = {
      async get() { return null; },
      async put() { throw new Error('KV write error'); }
    };
    await expect(writeToCache(kv, 'chrome', 'extid', SAMPLE_DATA)).resolves.toBeUndefined();
  });

  it('written entry can be read back correctly by readFromCache', async () => {
    const kv = makeKv();
    await writeToCache(kv, 'opera', 'myslug', { rating: 3.7, userCount: 1000 });
    const result = await readFromCache(kv, 'opera', 'myslug');
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.data.rating).toBe(3.7);
      expect(result.data.userCount).toBe(1000);
    }
  });
});
