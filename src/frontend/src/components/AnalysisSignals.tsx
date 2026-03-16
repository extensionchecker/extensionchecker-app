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
import { deriveAnalysisSignalState } from '../utils/analysis-signal-state';
import type { SignalVariant } from '../utils/analysis-signal-state';

type ChipVariant = SignalVariant;

interface SignalChipProps {
  icon: string;
  label: string;
  variant: ChipVariant;
  tooltip?: string;
}

function SignalChip({ icon, label, variant, tooltip }: SignalChipProps) {
  return (
    <span className={`analysis-signal analysis-signal--${variant}`} title={tooltip}>
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

interface AnalysisSignalsProps {
  report: AnalysisReport;
}

export function AnalysisSignals({ report }: AnalysisSignalsProps) {
  const { storeVariant, storeLabel, storeTooltip, storeHasNote, codeVariant, codeLabel, codeTooltip } = deriveAnalysisSignalState(report);

  const storeIcon =
    storeVariant === 'ok'     ? 'check_circle' :
    storeVariant === 'cached' ? 'history'      :
    storeVariant === 'error'  ? 'cancel'       : 'block';

  const codeIcon =
    codeVariant === 'ok'      ? 'check_circle'      :
    codeVariant === 'partial' ? 'incomplete_circle' : 'block';

  return (
    <div className="analysis-signals" aria-label="Analysis coverage">
      <SignalChip icon="check_circle" label="Manifest" variant="ok" tooltip="Manifest analysis complete." />
      <SignalChip icon={storeIcon} label={storeLabel} variant={storeVariant} tooltip={storeTooltip} />
      <SignalChip icon={codeIcon} label={codeLabel} variant={codeVariant} tooltip={codeTooltip} />
      {storeHasNote && (
        <p className="analysis-signals-note">
          Store lookup requires Firefox Add-ons (AMO) API — Chrome, Edge &amp; Opera have no public API
        </p>
      )}
    </div>
  );
}
