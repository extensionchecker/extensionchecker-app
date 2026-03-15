import { describe, expect, it } from 'vitest';
import { computeStoreTrustScore, computeCompositeScore } from '../src/scoring';

describe('computeStoreTrustScore', () => {
  it('returns null when neither rating nor userCount is provided', () => {
    expect(computeStoreTrustScore(undefined, undefined)).toBeNull();
  });

  it('scores based on rating alone when userCount is absent', () => {
    // 5.0 stars → 100
    expect(computeStoreTrustScore(5.0, undefined)).toBe(100);
    // 2.5 stars → 50
    expect(computeStoreTrustScore(2.5, undefined)).toBe(50);
    // 0 stars → 0
    expect(computeStoreTrustScore(0, undefined)).toBe(0);
  });

  it('scores based on userCount alone when rating is absent', () => {
    const score = computeStoreTrustScore(undefined, 1_000_000);
    expect(score).not.toBeNull();
    // log10(1M+1) / 8 * 100 ≈ 75
    expect(score!).toBeGreaterThan(70);
    expect(score!).toBeLessThan(80);
  });

  it('returns 100 for a perfect rating with 100M+ users', () => {
    const score = computeStoreTrustScore(5.0, 100_000_000);
    expect(score).toBe(100);
  });

  it('blends rating and download scores using configured weights when both are present', () => {
    // 5.0 stars = 100 (weight 0.6), 1M users ≈ 75 (weight 0.4)
    // blended ≈ 100*0.6 + 75*0.4 = 60 + 30 = 90
    const score = computeStoreTrustScore(5.0, 1_000_000);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(80);
    expect(score!).toBeLessThan(95);
  });

  it('is non-negative even for 0 users and 0 stars', () => {
    expect(computeStoreTrustScore(0, 0)).toBe(0);
  });
});

describe('computeCompositeScore', () => {
  it('returns full permissions score when store trust is 0 (no trust data)', () => {
    // trustModifier = 1.0 → score * (FLOOR + WEIGHT) = score * 1.0
    expect(computeCompositeScore(100, 0)).toBe(100);
  });

  it('significantly reduces score for maximum trust', () => {
    // storeTrust=100 → trustModifier=0 → score * FLOOR (0.08)
    expect(computeCompositeScore(100, 100)).toBe(8);
  });

  it('applies a floor so fully trusted extensions still show capability', () => {
    const score = computeCompositeScore(80, 100);
    // 80 * 0.08 = 6.4 → 6
    expect(score).toBe(6);
    expect(score).toBeGreaterThan(0);
  });

  it('leaves low permissions scores minimal regardless of trust', () => {
    const score = computeCompositeScore(10, 90);
    // 10 * (0.08 + 0.92 * 0.1) = 10 * 0.172 = 1.72 → 2
    expect(score).toBeLessThan(10);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('caps at 100 even without trust moderating', () => {
    expect(computeCompositeScore(100, 0)).toBeLessThanOrEqual(100);
  });

  it('never returns a negative score', () => {
    expect(computeCompositeScore(0, 100)).toBeGreaterThanOrEqual(0);
  });
});
