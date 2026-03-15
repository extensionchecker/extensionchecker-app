import type { Severity } from '@extensionchecker/shared';
import {
  COMPOSITE_SCORE_FLOOR,
  COMPOSITE_SCORE_WEIGHT,
  TRUST_COMPONENT_WEIGHTS,
  TRUST_DOWNLOAD_MAX_LOG
} from './scoring-config';

export function toSeverity(score: number): Severity {
  if (score >= 76) {
    return 'critical';
  }

  if (score >= 51) {
    return 'high';
  }

  if (score >= 26) {
    return 'medium';
  }

  return 'low';
}

export function capScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

/**
 * Derives a store trust score (0–100) from available store metadata.
 * 100 = maximum trust signal (top-rated, tens of millions of active users).
 * Returns null when no usable store data is provided.
 *
 * When both signals are available:
 *   score = ratingScore × TRUST_COMPONENT_WEIGHTS.rating
 *         + downloadScore × TRUST_COMPONENT_WEIGHTS.userCount
 *
 * Download count uses a log10 scale anchored at TRUST_DOWNLOAD_MAX_LOG
 * (default 8 → 100 million users = 100).
 *
 * Component weights and the download ceiling are configured in scoring-config.ts.
 */
export function computeStoreTrustScore(
  rating: number | undefined,
  userCount: number | undefined
): number | null {
  const hasRating = rating !== undefined;
  const hasUserCount = userCount !== undefined && userCount > 0;

  if (!hasRating && !hasUserCount) {
    return null;
  }

  const ratingScore = hasRating ? (rating / 5) * 100 : 0;
  const downloadScore = hasUserCount
    ? Math.min(100, (Math.log10(userCount + 1) / TRUST_DOWNLOAD_MAX_LOG) * 100)
    : 0;

  if (hasRating && hasUserCount) {
    const blended =
      ratingScore * TRUST_COMPONENT_WEIGHTS.rating +
      downloadScore * TRUST_COMPONENT_WEIGHTS.userCount;
    return Math.round(blended);
  }

  // Only one signal — use it at full weight.
  return Math.round(hasRating ? ratingScore : downloadScore);
}

/**
 * Computes the overall composite score when store trust data is available.
 *
 * The formula applies a trust modifier to the raw permissions score:
 *   trustModifier = (100 − storeTrustScore) / 100   (0 = full trust, 1 = no trust)
 *   composite     = permissionsScore × (FLOOR + WEIGHT × trustModifier)
 *
 * FLOOR  — minimum multiplier even at perfect trust (from scoring-config.ts).
 *          Keeps the capability footprint visible for even the most trusted extensions.
 * WEIGHT — how strongly store trust can pull the composite score down.
 *
 * See scoring-config.ts for the full example table and tuning guidance.
 */
export function computeCompositeScore(
  permissionsScore: number,
  storeTrustScore: number
): number {
  const trustModifier = (100 - storeTrustScore) / 100;
  return capScore(
    Math.round(permissionsScore * (COMPOSITE_SCORE_FLOOR + COMPOSITE_SCORE_WEIGHT * trustModifier))
  );
}
