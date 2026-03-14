import type { AnalysisReport, RiskSignal } from '@extensionchecker/shared';

export function verdictLabel(report: AnalysisReport): string {
  if (report.score.severity === 'critical') {
    return 'High Danger';
  }

  if (report.score.severity === 'high') {
    return 'Dangerous';
  }

  if (report.score.severity === 'medium') {
    return 'Use Caution';
  }

  return report.riskSignals.length === 0 ? 'Likely Low Risk' : 'Low Risk, Review Recommended';
}

export function verdictExplanation(report: AnalysisReport): string {
  if (report.score.severity === 'critical' || report.score.severity === 'high') {
    return 'This extension requests combinations of capabilities that can expose browsing data, sessions, or page content at scale.';
  }

  if (report.score.severity === 'medium') {
    return 'This extension has meaningful access that may be acceptable for its purpose, but it should be reviewed before trust.';
  }

  return 'No high-impact manifest combinations were detected in this static manifest-first analysis.';
}

export function explainSignalImpact(signal: RiskSignal): string {
  if (signal.severity === 'critical' || signal.severity === 'high') {
    return 'Potentially dangerous capability with broad misuse potential.';
  }

  if (signal.severity === 'medium') {
    return 'Meaningful capability that can affect privacy or integrity depending on implementation.';
  }

  return 'Lower-impact capability, but still relevant to overall trust.';
}
