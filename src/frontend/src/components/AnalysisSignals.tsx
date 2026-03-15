/**
 * Compact visual indicator showing which analysis phases contributed to the
 * overall trust score for this report.
 *
 * Manifest analysis is always performed. Store and code analysis depend on
 * what data was available at scan time.
 *
 * Store metadata is sourced exclusively from the Firefox Add-ons (AMO) public
 * API. Chrome Web Store, Edge Add-ons, and Opera Add-ons do not expose public
 * APIs for extension metadata.
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

  // Always label the store chip "Store" regardless of which store provided the
  // data — the Submission Source card already identifies the specific store.
  const storeChipLabel = 'Store';

  return (
    <div className="analysis-signals" aria-label="Analysis coverage">
      <SignalChip icon="check_circle" label="Manifest" active={true} />
      <SignalChip icon={hasStore ? 'check_circle' : 'cancel'} label={storeChipLabel} active={hasStore} />
      <SignalChip icon={hasCode ? 'check_circle' : 'cancel'} label="Code" active={hasCode} />
      {!hasStore && (
        <p className="analysis-signals-note">
          * Firefox Add-ons only — Chrome, Edge &amp; Opera have no public API
        </p>
      )}
    </div>
  );
}
