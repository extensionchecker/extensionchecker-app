import { describe, expect, it, vi } from 'vitest';
import { fetchAmoStoreData } from '../src/store-metadata';

const AMO_API_BASE = 'https://addons.mozilla.org/api/v5/addons/addon/';

function buildAmoResponse(averageDailyUsers: number, averageRating: number, ratingCount: number) {
  return new Response(
    JSON.stringify({
      average_daily_users: averageDailyUsers,
      ratings: {
        average: averageRating,
        count: ratingCount
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

describe('fetchAmoStoreData', () => {
  it('returns structured data for a valid AMO response', async () => {
    const mockFetch = vi.fn(async () => buildAmoResponse(1_500_000, 4.7, 8200));
    const result = await fetchAmoStoreData('ublock-origin', mockFetch as unknown as typeof fetch);

    expect(result).not.toBeNull();
    expect(result?.userCount).toBe(1_500_000);
    expect(result?.rating).toBe(4.7);
    expect(result?.ratingCount).toBe(8200);
    expect(mockFetch).toHaveBeenCalledWith(
      `${AMO_API_BASE}ublock-origin/`,
      expect.objectContaining({ headers: expect.anything() })
    );
  });

  it('returns null when the HTTP response is not ok', async () => {
    const mockFetch = vi.fn(async () => new Response(null, { status: 404 }));
    const result = await fetchAmoStoreData('nonexistent', mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    const mockFetch = vi.fn(async () => new Response('<html>error</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    }));
    const result = await fetchAmoStoreData('some-addon', mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null when the response JSON is missing required fields', async () => {
    const mockFetch = vi.fn(async () => new Response(
      JSON.stringify({ name: { en: 'Incomplete' } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    ));
    const result = await fetchAmoStoreData('incomplete', mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null when the network request throws (e.g. timeout)', async () => {
    const mockFetch = vi.fn(async () => { throw new Error('Network error'); });
    const result = await fetchAmoStoreData('addon', mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
  });

  it('returns null for an empty addon ID', async () => {
    const mockFetch = vi.fn();
    const result = await fetchAmoStoreData('', mockFetch as unknown as typeof fetch);
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('URL-encodes the addon ID to prevent path traversal', async () => {
    const mockFetch = vi.fn(async () => new Response(null, { status: 404 }));
    await fetchAmoStoreData('../sneaky', mockFetch as unknown as typeof fetch);
    const calledUrl = (mockFetch.mock.calls[0] as unknown[])[0] as string;
    // The slash in '../sneaky' must be percent-encoded so it cannot traverse
    // above the /addon/ path segment.
    expect(calledUrl).not.toContain('/../');
    expect(calledUrl).toContain('%2F');
  });
});
