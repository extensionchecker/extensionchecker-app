/**
 * Scoring configuration — tune this file to adjust how the composite
 * access score is computed from manifest permissions and store trust signals.
 *
 * PERMISSION_WEIGHTS (the per-permission additive scores that build the raw
 * permissions score) live in constants.ts.
 */

// ---------------------------------------------------------------------------
// Store trust computation
// ---------------------------------------------------------------------------

/**
 * log10 ceiling for the user-count component.
 * A user count at or above 10^MAX gives a download score of 100.
 * Default: 8  →  100 million users = full marks.
 * Lower this (e.g. 6) to reward 1M-user extensions more generously.
 */
export const TRUST_DOWNLOAD_MAX_LOG = 8;

/**
 * Blend weights for the two trust components (must sum to 1.0).
 *
 * rating:    weight given to the average star rating (0–5).
 * userCount: weight given to the log-scaled active user / download count.
 *
 * When only one signal is available it is used at full weight regardless.
 */
export const TRUST_COMPONENT_WEIGHTS = {
  rating: 0.6,
  userCount: 0.4
} as const;

// ---------------------------------------------------------------------------
// Composite score formula
// ---------------------------------------------------------------------------

/**
 * The composite score blends the raw permissions score with a trust modifier:
 *
 *   trustModifier = (100 − storeTrustScore) / 100   [0 = full trust, 1 = no trust]
 *   composite     = permissionsScore × (FLOOR + WEIGHT × trustModifier)
 *
 * FLOOR  — minimum multiplier at perfect trust (storeTrustScore = 100).
 *          Keeps the capability footprint visible even for maximally trusted extensions.
 *          A floor of 0.08 means a permission-heavy extension with perfect store signals
 *          still contributes 8% of its raw score to the overall result.
 *
 * WEIGHT — how strongly store trust can pull the composite score down.
 *          FLOOR + WEIGHT should be ≈ 1.0 so that zero-trust extensions score at or
 *          near their full raw permissions score.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Example outputs (permissionsScore = 100, FLOOR = 0.08, WEIGHT = 0.92)  │
 * ├──────────────────────────────────┬─────────────────────────────────────┤
 * │ storeTrust = 85 (4.6★, ~1M usr) │ composite ≈ 22  → Minimal           │
 * │ storeTrust = 70 (decent signals) │ composite ≈ 36  → Moderate          │
 * │ storeTrust = 50 (average)        │ composite ≈ 54  → Broad             │
 * │ storeTrust = 20 (poor signals)   │ composite ≈ 82  → Complete          │
 * │ storeTrust =  0 (no data)        │ composite = 100 → Complete          │
 * └──────────────────────────────────┴─────────────────────────────────────┘
 *
 * Raise FLOOR to keep high-trust extensions more visible (more cautious).
 * Lower FLOOR to let high-trust extensions score lower (more lenient).
 * Raise WEIGHT to make trust pull harder (faster drop at high trust).
 */
export const COMPOSITE_SCORE_FLOOR = 0.08;
export const COMPOSITE_SCORE_WEIGHT = 0.92;

// ---------------------------------------------------------------------------
// Score tier boundaries
// ---------------------------------------------------------------------------

/**
 * Inclusive upper bounds for each capability access tier.
 * Scores above BROAD fall into the "Complete" tier (no upper bound needed).
 *
 * Capability tiers map directly to Severity:
 *   0–MINIMAL  → low       → Minimal Access  (green)
 *   MINIMAL+1–MODERATE → medium   → Moderate Access (yellow)
 *   MODERATE+1–BROAD   → high     → Broad Access    (orange)
 *   BROAD+1–100        → critical → Complete Access  (red)
 */
export const CAPABILITY_TIER_THRESHOLDS = {
  minimal: 25,
  moderate: 50,
  broad: 75
} as const;
