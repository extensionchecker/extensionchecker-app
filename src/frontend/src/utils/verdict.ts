import type { AnalysisReport, RiskSignal } from '@extensionchecker/shared';
import { overallTrustScore } from './trust-signal';

/**
 * Top-level trust verdict label — expressed in trust terms, not risk terms.
 * Uses the same 5-band scale as the store trust donut.
 */
export function verdictLabel(report: AnalysisReport): string {
  const trust = overallTrustScore(report);

  if (trust >= 81) {
    return 'High Trust';
  }

  if (trust >= 61) {
    return 'Strong Trust';
  }

  if (trust >= 41) {
    return 'Moderate Trust';
  }

  if (trust >= 21) {
    return 'Limited Trust';
  }

  return 'Low Trust';
}

/**
 * Explanation paragraph for the overall trust verdict.
 * Frames findings in trust terms rather than accusatory risk language.
 */
export function verdictExplanation(report: AnalysisReport): string {
  const trust = overallTrustScore(report);

  if (trust >= 81) {
    return 'This extension has a minimal access footprint or strong established credibility — the overall trust signal is high.';
  }

  if (trust >= 61) {
    return 'This extension has good standing overall. The capability scope is worth a quick review, but there is no significant cause for concern based on available signals.';
  }

  if (trust >= 41) {
    return 'This extension sits in the middle of the trust range. Some access capabilities are declared and trust signals are average — review the findings before installing.';
  }

  if (trust >= 21) {
    return 'This extension has limited trust signals — broad access capabilities, a weak store presence, or both. Careful review of the findings is strongly recommended.';
  }

  return 'This extension presents low trust signals. Significant access to sensitive browser surfaces is declared, with little or no established credibility. Do not install without understanding exactly what this extension does.';
}

/**
 * Secondary context sentence explaining how the trust score was derived —
 * manifest-only vs composite with store signals.
 */
export function overallScoreContext(report: AnalysisReport): string {
  if (report.scoringBasis === 'manifest-and-store') {
    const trustScore = report.storeTrustScore ?? 0;
    const capScore = report.permissionsScore ?? report.score.value;

    if (trustScore >= 75) {
      return `The overall trust score combines the declared capability footprint (${capScore}/100 risk) with strong store signals, which significantly moderates the result.`;
    }

    if (trustScore >= 40) {
      return `The overall trust score combines the declared capability footprint (${capScore}/100 risk) with moderate store signals. The extension has some public track record.`;
    }

    return `The overall trust score combines the declared capability footprint (${capScore}/100 risk) with limited store signals — low download counts or ratings carry less moderating weight.`;
  }

  return 'This score is based solely on the declared permissions in the extension manifest. No store metadata was available to provide additional context.';
}

export function explainSignalImpact(signal: RiskSignal): string {
  if (signal.severity === 'critical' || signal.severity === 'high') {
    return 'High-impact capability — broad potential to access or influence browser activity.';
  }

  if (signal.severity === 'medium') {
    return 'Meaningful capability that may affect privacy or data integrity depending on how the extension uses it.';
  }

  return 'Lower-impact capability, but still relevant to the overall access footprint.';
}
