/**
 * Scrapes extension metadata from the Opera Add-ons listing page.
 *
 * Strategy:
 *  The Opera Add-ons site is a server-rendered Django application. We extract:
 *   1. Star rating - from schema.org microdata itemprop attributes, or JSON-LD,
 *      or heuristic regex patterns in the page text.
 *   2. Download / user count - from visible page text or meta tags.
 *
 *  Opera Add-ons pages are relatively HTML-stable, but the format is sparse -
 *  not all extensions have ratings, and download counts may not be present.
 *
 * Failure is non-fatal - null is returned for any network, parse, or
 * structure error so the caller can fall back to manifest-only scoring.
 */

import { z } from 'zod';
import type { ScrapedStoreData } from './types';

const OPERA_STORE_BASE = 'https://addons.opera.com/extensions/details/';
const SCRAPE_TIMEOUT_MS = 8_000;

const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0';

// Zod schema for JSON-LD aggregateRating (Opera may generate it for search engines).
const JsonLdRatingSchema = z.object({
  aggregateRating: z
    .object({
      ratingValue: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v))),
      ratingCount: z
        .union([z.string(), z.number()])
        .optional()
        .transform((v) => (v !== undefined ? parseInt(String(v).replace(/,/g, ''), 10) : undefined)),
      reviewCount: z
        .union([z.string(), z.number()])
        .optional()
        .transform((v) => (v !== undefined ? parseInt(String(v).replace(/,/g, ''), 10) : undefined))
    })
    .optional()
});

function extractJsonLdBlocks(html: string): unknown[] {
  const results: unknown[] = [];
  const pattern = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1] ?? ''));
    } catch {
      // Skip malformed blocks.
    }
  }
  return results;
}

function extractRatingFromMicrodata(html: string): { rating?: number; ratingCount?: number } {
  // schema.org microdata: <meta itemprop="ratingValue" content="4.5">
  const ratingMatch = /itemprop="ratingValue"\s+content="([^"]+)"/i.exec(html)
    ?? /itemprop="ratingValue"[^>]*>([^<]+)/i.exec(html);
  const countMatch = /itemprop="ratingCount"\s+content="([^"]+)"/i.exec(html)
    ?? /itemprop="ratingCount"[^>]*>([^<]+)/i.exec(html)
    ?? /itemprop="reviewCount"\s+content="([^"]+)"/i.exec(html);

  const rating = ratingMatch?.[1] ? parseFloat(ratingMatch[1]) : undefined;
  const ratingCount = countMatch?.[1] ? parseInt(countMatch[1].replace(/,/g, ''), 10) : undefined;

  return {
    ...(rating !== undefined && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? { rating } : {}),
    ...(ratingCount !== undefined && Number.isFinite(ratingCount) ? { ratingCount } : {})
  };
}

function extractDownloadCount(html: string): number | undefined {
  // Opera Add-ons typically shows download counts as "X,XXX Downloads" or similar.
  const patterns = [
    /(\d[\d,]+)\s+(?:downloads?|users?|installs?)/i,
    /class="[^"]*downloads?[^"]*"[^>]*>\s*(\d[\d,]+)/i
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m?.[1]) {
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return undefined;
}

export async function fetchOperaStoreData(
  slug: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = SCRAPE_TIMEOUT_MS
): Promise<ScrapedStoreData | null> {
  if (!slug || slug.length === 0) return null;

  const url = `${OPERA_STORE_BASE}${encodeURIComponent(slug)}/`;

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

  // Try JSON-LD first (most structured).
  let rating: number | undefined;
  let ratingCount: number | undefined;

  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    const parsed = JsonLdRatingSchema.safeParse(block);
    if (parsed.success && parsed.data.aggregateRating) {
      const ar = parsed.data.aggregateRating;
      rating = ar.ratingValue;
      ratingCount = ar.ratingCount ?? ar.reviewCount;
      break;
    }
  }

  // Fall back to microdata if JSON-LD did not yield a rating.
  if (rating === undefined) {
    const microdata = extractRatingFromMicrodata(html);
    rating = microdata.rating;
    ratingCount = microdata.ratingCount;
  }

  // Validate range.
  if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    rating = undefined;
  }

  const userCount = extractDownloadCount(html);

  if (rating === undefined && userCount === undefined) return null;

  return {
    ...(rating !== undefined ? { rating } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
    ...(userCount !== undefined ? { userCount } : {})
  };
}
