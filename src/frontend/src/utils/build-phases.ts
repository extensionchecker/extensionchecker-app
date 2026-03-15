/**
 * Constructs the ordered list of analysis phases from an AnalysisReport.
 *
 * Single source of truth consumed by both the React UI (ResultsPage) and the
 * PDF generator so that phase titles, statuses, and detail text stay in sync
 * without duplicated logic.
 */
import type { AnalysisReport } from '@extensionchecker/shared';
import type { PhaseStatus } from '../types';

export interface ReportPhase {
  id: string;
  title: string;
  status: PhaseStatus;
  /** Present for the code phase — distinguishes lite regex from a full AST scan. */
  scanQuality?: 'lite' | 'full';
  detail: string;
}

function formatBytesDisplay(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function buildCodePhaseDetail(report: AnalysisReport, status: PhaseStatus): string {
  if (status === 'not-available') {
    return 'No JavaScript files were found in this package, or the code scan produced no results.';
  }

  const scanned = report.limits.codeAnalysisFilesScanned ?? 0;
  const skipped = report.limits.codeAnalysisFilesSkipped ?? 0;
  const bytes = report.limits.codeAnalysisBytesScanned ?? 0;
  const exhausted = report.limits.codeAnalysisBudgetExhausted === true;

  if (status === 'complete') {
    return `Complete. Lite pattern-based code scan analyzed ${scanned} JS file(s) (${formatBytesDisplay(bytes)}). Regex detectors checked for dynamic code execution, DOM injection, data exfiltration, dangerous Chrome APIs, and obfuscation indicators.`;
  }

  return `Partial. Analyzed ${scanned} JS file(s) (${formatBytesDisplay(bytes)})${skipped > 0 ? `, skipping ${skipped} file(s)` : ''}. ${exhausted ? 'The scan budget was reached before all files could be analyzed — results reflect the highest-priority files (background scripts and content scripts first).' : 'Some files were skipped because they exceeded the per-file size limit.'} Regex detectors checked for dynamic code execution, DOM injection, data exfiltration, and obfuscation indicators.`;
}

export function buildPhases(report: AnalysisReport): ReportPhase[] {
  const codePhaseStatus: PhaseStatus =
    report.limits.codeExecutionAnalysisPerformed
      ? report.limits.codeAnalysisBudgetExhausted
        ? 'partial'
        : 'complete'
      : 'not-available';

  const scoringBasis = report.scoringBasis;

  let storePhaseStatus: PhaseStatus;
  let storePhaseDetail: string;

  if (scoringBasis === 'manifest-and-store') {
    storePhaseStatus = 'complete';
    storePhaseDetail = 'Complete. Fresh store metadata was retrieved and incorporated into scoring.';
  } else if (scoringBasis === 'manifest-and-store-cached') {
    storePhaseStatus = 'cached';
    const cachedAt = report.storeDataCachedAt
      ? new Date(report.storeDataCachedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : 'an earlier date';
    storePhaseDetail = `Store metadata retrieved from cache (originally scraped on ${cachedAt}). A fresh fetch was not available at analysis time. Scoring incorporates cached store signals.`;
  } else if (scoringBasis === 'manifest-store-unavailable') {
    storePhaseStatus = 'unavailable';
    storePhaseDetail = 'Store lookup was attempted but returned no usable data — this may be due to a network error, a rate limit, or an unrecognized page structure. Scoring falls back to manifest analysis only.';
  } else {
    storePhaseStatus = 'not-available';
    storePhaseDetail = report.source.type === 'file'
      ? 'Not applicable. This extension was submitted as a file upload — no store lookup was performed.'
      : 'Not applicable. No store lookup was performed for this extension.';
  }

  return [
    {
      id: 'manifest',
      title: 'Phase 1: Manifest Analysis',
      status: 'complete',
      detail: 'Complete. Parsed manifest metadata, permissions, host access, and manifest-declared capability combinations.'
    },
    {
      id: 'store',
      title: 'Phase 2: Store Metadata Lookup',
      status: storePhaseStatus,
      detail: storePhaseDetail
    },
    {
      id: 'code',
      title: 'Phase 3: Code Analysis',
      status: codePhaseStatus,
      scanQuality: report.limits.codeAnalysisMode === 'lite' ? 'lite' : 'full',
      detail: buildCodePhaseDetail(report, codePhaseStatus)
    }
  ];
}
