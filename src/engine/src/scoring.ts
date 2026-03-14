import type { Severity } from '@extensionchecker/shared';

export function toSeverity(score: number): Severity {
  if (score >= 75) {
    return 'critical';
  }

  if (score >= 50) {
    return 'high';
  }

  if (score >= 25) {
    return 'medium';
  }

  return 'low';
}

export function capScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}
