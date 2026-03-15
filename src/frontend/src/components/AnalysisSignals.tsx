/**
 * Compact visual indicator showing which analysis phases contributed to the
 * overall trust score for this report.
 *
 * Manifest analysis is always performed. Store and code analysis depend on
 * what data was available at scan time.
 */

import type { AnalysisReport } from '@extensionchecker/shared';

interface SignalChipProps {
  icon: 'check_circle' | 'cancel';
  label: string;
  active: boolean;
}

function SignalChip({ icon, label, active }: SignalChipProps) {
  return (
    <span className={`analysis-signal ${active ? 'analysis-signal--ok' : 'analysis-signal--na'}`}>
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

interface AnalysisSignalsProps {
  report: AnalysisReport;
}

export function AnalysisSignals({ report }: AnalysisSignalsProps) {
  const hasStore = report.scoringBasis === 'manifest-and-store';
  const hasCode = report.limits.codeExecutionAnalysisPerformed;

  return (
    <div className="analysis-signals" aria-label="Analysis coverage">
      <SignalChip icon="check_circle" label="Manifest" active={true} />
      <SignalChip icon={hasStore ? 'check_circle' : 'cancel'} label="Store" active={hasStore} />
      <SignalChip icon={hasCode ? 'check_circle' : 'cancel'} label="Code" active={hasCode} />
      {!hasStore && (
        <p className="analysis-signals-note">* Excludes browser store metadata</p>
      )}
    </div>
  );
}
