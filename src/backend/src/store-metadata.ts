/**
 * Fetches live store metadata from the Firefox Add-ons (AMO) public API v5.
 *
 * AMO is the only browser extension store with a fully public, stable REST API.
 * Chrome Web Store, Edge Add-ons, Opera Add-ons, and Safari App Store do not
 * provide public APIs for extension metadata.
 *
 * Failures are intentionally non-fatal: if the AMO call times out, returns an
 * unexpected status, or returns malformed data, the caller receives null and
 * the analysis proceeds with manifest-only scoring.
 */

import { z } from 'zod';

export type AmoStoreData = {
  rating: number;
  ratingCount: number;
  userCount: number;
};

const AMO_API_BASE = 'https://addons.mozilla.org/api/v5/addons/addon/';
const AMO_FETCH_TIMEOUT_MS = 5_000;

const AmoAddonSchema = z.object({
  average_daily_users: z.number().int().min(0),
  ratings: z.object({
    average: z.number().min(0).max(5),
    count: z.number().int().min(0)
  })
});

export async function fetchAmoStoreData(
  addonId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = AMO_FETCH_TIMEOUT_MS
): Promise<AmoStoreData | null> {
  if (!addonId || addonId.length === 0) {
    return null;
  }

  // Encode addon ID to prevent path injection - AMO slugs and IDs are safe
  // alphanumeric/hyphen strings, but we encode defensively regardless.
  const encodedId = encodeURIComponent(addonId);
  const apiUrl = `${AMO_API_BASE}${encodedId}/`;

  let response: Response;
  try {
    response = await fetchImpl(apiUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' }
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return null;
  }

  const parsed = AmoAddonSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }

  return {
    rating: parsed.data.ratings.average,
    ratingCount: parsed.data.ratings.count,
    userCount: parsed.data.average_daily_users
  };
}
