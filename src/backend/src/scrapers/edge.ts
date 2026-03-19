/**
 * Scrapes extension metadata from the Microsoft Edge Add-ons listing page.
 *
 * Strategy:
 *  The Edge Add-ons site migrated from Next.js SSR (which embedded a
 *  __NEXT_DATA__ JSON block) to a client-side React SPA in early 2026.
 *  The page HTML is now a static shell rendered server-side; all dynamic
 *  extension data loads at runtime via internal API calls.
 *
 *  However, Microsoft still embeds schema.org microdata <meta> tags directly
 *  in the server-rendered HTML shell, making them available without JavaScript:
 *
 *    <meta itemprop="ratingValue" content="4.5">
 *    <meta itemprop="ratingCount" content="2607">
 *    <meta itemProp="userInteractionCount" content="14551241" />
 *
 *  We extract these via regex pattern matching on the raw HTML. Developer URL
 *  is not exposed via microdata on this page and cannot be recovered this way.
 *
 * Failure is non-fatal - null is returned for any network, parse, or
 * structure mismatch so the caller falls back gracefully.
 */

import type { ScrapedStoreData } from './types';

const EDGE_STORE_BASE = 'https://microsoftedge.microsoft.com/addons/detail/';
const SCRAPE_TIMEOUT_MS = 8_000;

/** Maximum HTML response bytes to buffer from a store listing page (2 MB). */
const MAX_HTML_RESPONSE_BYTES = 2 * 1024 * 1024;

const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

/**
 * Extracts a non-negative integer from a schema.org <meta itemprop> tag.
 * Handles both attribute orderings (itemprop-first and content-first).
 */
function extractMicrodataInt(html: string, prop: string): number | undefined {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\s[^>]*?itemprop="${escaped}"[^>]*?content="(\\d+)"`, 'i'),
    new RegExp(`<meta\\s[^>]*?content="(\\d+)"[^>]*?itemprop="${escaped}"`, 'i')
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return undefined;
}

/**
 * Extracts a non-negative float from a schema.org <meta itemprop> tag.
 * Handles both attribute orderings (itemprop-first and content-first).
 */
function extractMicrodataFloat(html: string, prop: string): number | undefined {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\s[^>]*?itemprop="${escaped}"[^>]*?content="([0-9.]+)"`, 'i'),
    new RegExp(`<meta\\s[^>]*?content="([0-9.]+)"[^>]*?itemprop="${escaped}"`, 'i')
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m?.[1]) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return undefined;
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
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_RESPONSE_BYTES) return null;
    html = new TextDecoder().decode(buffer);
  } catch {
    return null;
  }

  const rawRating = extractMicrodataFloat(html, 'ratingValue');
  const ratingCount = extractMicrodataInt(html, 'ratingCount');
  const userCount = extractMicrodataInt(html, 'userInteractionCount');

  // Clamp ratingValue to the valid 0–5 range; discard out-of-range values.
  const rating = rawRating !== undefined && rawRating >= 0 && rawRating <= 5 ? rawRating : undefined;

  if (rating === undefined && ratingCount === undefined && userCount === undefined) return null;

  return {
    ...(rating !== undefined ? { rating } : {}),
    ...(ratingCount !== undefined ? { ratingCount } : {}),
    ...(userCount !== undefined ? { userCount } : {})
  };
}
