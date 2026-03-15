/**
 * Scrapes extension metadata from the Chrome Web Store listing page.
 *
 * Strategy:
 *  1. Fetch the listing page with a browser-like User-Agent so Google serves
 *     the full SSR HTML (including JSON-LD structured data).
 *  2. Extract schema.org JSON-LD blocks and parse aggregateRating.
 *  3. Extract user/install count via a JSON-LD interactionStatistic or
 *     page-text regex patterns as a fallback.
 *
 * Failure is non-fatal — null is returned for any network, parse, or
 * structure error so the caller can fall back to manifest-only scoring.
 */

import { z } from 'zod';
import type { ScrapedStoreData } from './types';

const CHROME_STORE_BASE = 'https://chromewebstore.google.com/detail/';
const SCRAPE_TIMEOUT_MS = 8_000;

// A browser-like UA is required — Google returns a stripped page for bots.
const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Schema for the aggregateRating block in JSON-LD. Both string and number
// values are possible (schema.org allows either).
const AggregateRatingSchema = z.object({
  aggregateRating: z
    .object({
      ratingValue: z.union([z.string(), z.number()]).transform((v) => parseFloat(String(v))),
      // Chrome Web Store uses either ratingCount or reviewCount depending on region.
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

// Schema for the interactionStatistic block in JSON-LD (install count).
// May be a single object or an array of objects.
const InteractionStatSchema = z.union([
  z.object({ userInteractionCount: z.union([z.string(), z.number()]).optional() }),
  z.array(z.object({ userInteractionCount: z.union([z.string(), z.number()]).optional() }))
]);

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

function parseUserCountFromInteraction(stat: unknown): number | undefined {
  const parsed = InteractionStatSchema.safeParse(stat);
  if (!parsed.success) return undefined;

  const items = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  for (const item of items) {
    const raw = item.userInteractionCount;
    if (raw === undefined) continue;
    const n = parseInt(String(raw).replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

function extractUserCountFromHtml(html: string): number | undefined {
  // Try embedded JSON-LD interactionStatistic first.
  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    const count = parseUserCountFromInteraction(b['interactionStatistic']);
    if (count !== undefined) return count;
  }

  // Fallback: page text patterns used by the Chrome Web Store renderer.
  const patterns = [
    /"userInteractionCount"\s*:\s*"?(\d+)"?/,
    /(\d[\d,]+)\+?\s+users/i
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

export async function fetchChromeStoreData(
  extensionId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = SCRAPE_TIMEOUT_MS
): Promise<ScrapedStoreData | null> {
  if (!extensionId || extensionId.length === 0) return null;

  const url = `${CHROME_STORE_BASE}${encodeURIComponent(extensionId)}`;

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

  // Parse JSON-LD blocks for rating.
  let rating: number | undefined;
  let ratingCount: number | undefined;
  const blocks = extractJsonLdBlocks(html);
  for (const block of blocks) {
    const parsed = AggregateRatingSchema.safeParse(block);
    if (parsed.success && parsed.data.aggregateRating) {
      const ar = parsed.data.aggregateRating;
      rating = ar.ratingValue;
      ratingCount = ar.ratingCount ?? ar.reviewCount;
      break;
    }
  }

  // Validate the rating is in a sensible range before accepting it.
  if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    rating = undefined;
  }

  const userCount = extractUserCountFromHtml(html);

  // Return null rather than an empty object — partial data with at least one
  // signal is useful; a completely empty result is not.
  if (rating === undefined && userCount === undefined) return null;

  return {
    ...(rating !== undefined ? { rating } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
    ...(userCount !== undefined ? { userCount } : {})
  };
}
