/**
 * Shared trust signal utilities.
 *
 * This module is the single source of truth for:
 *   - Converting a composite risk score into an overall trust score.
 *   - Generating a human-readable explanation of what specific store signals
 *     drove the trust score (e.g. high ratings but low download count, etc.).
 *
 * Imported by both the React components (OverviewPanel) and the PDF generator
 * (pdf/verdict-card) so that any change here automatically applies to both.
 */

import type { AnalysisReport } from '@extensionchecker/shared';

/**
 * Overall trust score (0–100): the complement of the composite risk score.
 *
 * High trust (near 100) = low risk / strong established credibility.
 * Low trust  (near 0)   = high risk + weak or absent store signals.
 */
export function overallTrustScore(report: AnalysisReport): number {
  return Math.max(0, 100 - report.score.value);
}

/**
 * Returns a concise, human-readable sentence explaining what specific store
 * signals drove the trust component - surfacing tensions when rating and
 * download count tell contradictory stories.
 *
 * Returns null when no store metadata is available (manifest-only analysis).
 *
 * Examples:
 *   "Rated 5.0★ but only 12 users - a high rating with limited adoption carries less weight."
 *   "800K users but rated only 1.8★ - broad adoption with below-average satisfaction is a caution signal."
 *   "Strong trust signals: 4.6★ avg rating with 1.2M active users."
 */
export function trustSignalExplanation(report: AnalysisReport): string | null {
  if (report.scoringBasis !== 'manifest-and-store' || report.storeMetadata == null) {
    return null;
  }

  const { rating, userCount } = report.storeMetadata;
  const hasRating = rating !== undefined;
  const hasUsers = userCount !== undefined && userCount > 0;

  if (!hasRating && !hasUsers) {
    return null;
  }

  const ratingStr = hasRating ? `${rating!.toFixed(1)}★` : null;
  const userStr = hasUsers ? formatUserCount(userCount!) : null;

  if (hasRating && hasUsers) {
    const highRating = rating! >= 4.0;
    const lowRating = rating! < 3.0;
    const highUsers = userCount! >= 100_000;
    const lowUsers = userCount! < 1_000;

    if (highRating && lowUsers) {
      return `Rated ${ratingStr} but only ${userStr} users - a high rating with limited adoption carries less weight.`;
    }

    if (lowRating && highUsers) {
      return `${userStr} users but rated only ${ratingStr} - broad adoption with below-average satisfaction is a caution signal.`;
    }

    if (highRating && highUsers) {
      return `Strong trust signals: ${ratingStr} avg rating with ${userStr} active users.`;
    }

    if (lowRating && lowUsers) {
      return `Weak trust signals: ${ratingStr} avg rating and only ${userStr} users - insufficient evidence to establish confidence.`;
    }

    return `Store signals: ${ratingStr} avg rating, ${userStr} active users.`;
  }

  if (hasRating && !hasUsers) {
    return rating! >= 4.0
      ? `Rated ${ratingStr} on the store - no active user count available to corroborate.`
      : `Below-average rating (${ratingStr}) - no active user count available.`;
  }

  // hasUsers only
  return userCount! >= 100_000
    ? `${userStr} active users on the store - no rating data available.`
    : `Only ${userStr} users on the store - limited adoption signal.`;
}

function formatUserCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }

  if (count >= 1_000) {
    return `${Math.round(count / 1_000)}K`;
  }

  return String(count);
}
