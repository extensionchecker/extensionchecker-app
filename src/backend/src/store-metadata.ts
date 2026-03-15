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
import type { ScrapedStoreData } from './scrapers/types';

const AMO_API_BASE = 'https://addons.mozilla.org/api/v5/addons/addon/';
const AMO_FETCH_TIMEOUT_MS = 5_000;

/**
 * Extracts a plain string from an AMO localized field.
 * AMO returns localized strings as either a plain string or an object keyed
 * by locale code, e.g. `{"en-US": "...", "fr": "..."}`. We prefer en-US and
 * fall back to the first available locale.
 */
const AmoLocalizedStringSchema = z
  .union([z.string(), z.record(z.string())])
  .optional()
  .transform((v): string | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'string') return v.length > 0 ? v : undefined;
    const enUs = v['en-US'];
    if (typeof enUs === 'string' && enUs.length > 0) return enUs;
    const first = Object.values(v).find((s): s is string => typeof s === 'string' && s.length > 0);
    return first;
  });

const AmoAddonSchema = z.object({
  average_daily_users: z.number().int().min(0),
  ratings: z.object({
    average: z.number().min(0).max(5),
    count: z.number().int().min(0)
  }),
  /** Developer homepage URL, localized. Present when the developer has set one. */
  homepage: z
    .object({ url: AmoLocalizedStringSchema })
    .optional(),
  /** Short summary shown on the store listing, localized. */
  summary: AmoLocalizedStringSchema
});

export async function fetchAmoStoreData(
  addonId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = AMO_FETCH_TIMEOUT_MS
): Promise<ScrapedStoreData | null> {
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

  const result: ScrapedStoreData = {
    rating: parsed.data.ratings.average,
    ratingCount: parsed.data.ratings.count,
    userCount: parsed.data.average_daily_users
  };

  const summary = parsed.data.summary;
  if (summary) result.description = summary;

  const homepageUrl = parsed.data.homepage?.url;
  if (homepageUrl && isHttpsUrl(homepageUrl)) result.homepageUrl = homepageUrl;

  return result;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
