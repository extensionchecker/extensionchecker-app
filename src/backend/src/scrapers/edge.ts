/**
 * Scrapes extension metadata from the Microsoft Edge Add-ons listing page.
 *
 * Strategy:
 *  The Edge Add-ons site is a Next.js application. The server-side-rendered
 *  HTML embeds a <script id="__NEXT_DATA__"> tag containing the full page
 *  props as JSON, including the add-on details object. We extract that block
 *  and navigate the object tree defensively.
 *
 *  Field names in the JSON have varied across Edge Add-ons deployments, so the
 *  parser tries multiple known paths for each signal.
 *
 * Failure is non-fatal - null is returned for any network, parse, or
 * structure error so the caller can fall back to manifest-only scoring.
 */

import { z } from 'zod';
import type { ScrapedStoreData } from './types';

const EDGE_STORE_BASE = 'https://microsoftedge.microsoft.com/addons/detail/';
const SCRAPE_TIMEOUT_MS = 8_000;

const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

// Zod schema for the add-on detail object buried inside __NEXT_DATA__.
// Accepts multiple possible field name variants observed across Edge Add-ons
// page structure versions. All fields are optional to handle partial data.
const EdgeAddOnDetailSchema = z.object({
  averageRating: z.number().min(0).max(5).optional(),
  numberOfRatings: z.number().int().min(0).optional(),
  ratingsCount: z.number().int().min(0).optional(),
  activeInstallCount: z.number().int().min(0).optional(),
  activeTotalInstalls: z.number().int().min(0).optional(),
  installCount: z.number().int().min(0).optional(),
  // Developer homepage URL - field name varies across Edge Add-ons page versions.
  developerWebsite: z.string().optional(),
  developerHomepage: z.string().optional(),
  developerUrl: z.string().optional()
});

function extractNextData(html: string): unknown {
  // Next.js embeds page state in a <script id="__NEXT_DATA__"> tag.
  const match = /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function findAddOnDetail(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return null;

  // Navigate: props → pageProps → one of several known detail-object keys.
  const props = (data as Record<string, unknown>)['props'];
  if (typeof props !== 'object' || props === null) return null;

  const pageProps = (props as Record<string, unknown>)['pageProps'];
  if (typeof pageProps !== 'object' || pageProps === null) return null;

  const pp = pageProps as Record<string, unknown>;

  // Try known variant keys for the detail object.
  return pp['addOnDetails'] ?? pp['addOnDetail'] ?? pp['addOnData'] ?? pp['extension'] ?? null;
}

export async function fetchEdgeStoreData(
  extensionId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = SCRAPE_TIMEOUT_MS
): Promise<ScrapedStoreData | null> {
  if (!extensionId || extensionId.length === 0) return null;

  // Edge redirects /detail/{id} to /detail/{slug}/{id} - allow the redirect.
  const url = `${EDGE_STORE_BASE}${encodeURIComponent(extensionId)}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': SCRAPE_USER_AGENT
      }
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let html: string;
  try {
    html = await response.text();
  } catch {
    return null;
  }

  const nextData = extractNextData(html);
  const detail = findAddOnDetail(nextData);

  const parsed = EdgeAddOnDetailSchema.safeParse(detail);
  if (!parsed.success) return null;

  const d = parsed.data;
  const rating = d.averageRating;
  const ratingCount = d.numberOfRatings ?? d.ratingsCount;
  const userCount = d.activeInstallCount ?? d.activeTotalInstalls ?? d.installCount;

  // Accept the first developer URL variant that looks like a safe HTTPS URL.
  const rawDevUrl = d.developerWebsite ?? d.developerHomepage ?? d.developerUrl;
  const developerUrl = rawDevUrl && isHttpsUrl(rawDevUrl) ? rawDevUrl : undefined;

  if (rating === undefined && userCount === undefined && developerUrl === undefined) return null;

  return {
    ...(rating !== undefined ? { rating } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
    ...(userCount !== undefined ? { userCount } : {}),
    ...(developerUrl !== undefined ? { developerUrl } : {})
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
