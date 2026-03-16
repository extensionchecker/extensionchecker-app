/**
 * Derives the display state for each analysis signal (manifest, store, code)
 * from an AnalysisReport.
 *
 * Single source of truth consumed by both the React AnalysisSignals chip
 * component and the PDF generator so that variant labels, icons, and note
 * text stay in sync without duplicated derivation logic.
 */
import type { AnalysisReport } from '@extensionchecker/shared';

/**
 * Signal chip variant — drives colour and icon semantics.
 *   ok      — phase ran and completed successfully (green)
 *   partial — phase ran but was cut short by budget (amber)
 *   cached  — phase result served from cache (blue)
 *   error   — phase was attempted but failed (red)
 *   na      — phase was not applicable or disabled (grey)
 */
export type SignalVariant = 'ok' | 'partial' | 'cached' | 'error' | 'na';

export interface AnalysisSignalState {
  storeVariant: SignalVariant;
  storeLabel: string;
  /** Tooltip text explaining the store analysis outcome. */
  storeTooltip: string;
  /** True when store lookup requires Firefox AMO — UI should surface a note. */
  storeHasNote: boolean;
  codeVariant: SignalVariant;
  codeLabel: string;
  /** Tooltip text explaining the code analysis outcome. */
  codeTooltip: string;
}

export function deriveAnalysisSignalState(report: AnalysisReport): AnalysisSignalState {
  const scoringBasis    = report.scoringBasis;
  const codeMode        = report.limits.codeAnalysisMode;
  const budgetExhausted = report.limits.codeAnalysisBudgetExhausted === true;
  const codePerformed   = report.limits.codeExecutionAnalysisPerformed;

  const storeVariant: SignalVariant =
    scoringBasis === 'manifest-and-store'         ? 'ok'    :
    scoringBasis === 'manifest-and-store-cached'  ? 'cached' :
    scoringBasis === 'manifest-store-unavailable' ? 'error'  : 'na';

  const storeLabel =
    storeVariant === 'cached' ? 'Store (Cached)' :
    storeVariant === 'error'  ? 'Store (Error)'  : 'Store';

  const storeTooltip =
    storeVariant === 'ok'     ? 'Store metadata retrieved and included in the trust score.' :
    storeVariant === 'cached' ? 'Store metadata served from cache and included in the trust score.' :
    storeVariant === 'error'  ? 'Store metadata could not be retrieved. Chrome, Edge, and Opera Add-ons stores do not provide a public API; the lookup may have timed out or been blocked. The trust score is based on manifest and code analysis only.' :
                                'Store metadata lookup was not performed for this extension.';

  const storeHasNote = storeVariant === 'na';

  const codeVariant: SignalVariant =
    !codePerformed  ? 'na'      :
    budgetExhausted ? 'partial' : 'ok';

  const codeLabel =
    !codePerformed      ? 'Code'            :
    budgetExhausted     ? 'Code (Partial)'  :
    codeMode === 'lite' ? 'Code (Lite)'     : 'Code (Full)';

  const codeTooltip =
    !codePerformed      ? 'Code analysis was not performed.' :
    budgetExhausted     ? 'Code scan was cut short by the analysis budget. Results reflect the highest-priority files (background scripts and content scripts first).' :
    codeMode === 'lite' ? 'Lite code scan complete. Checked for dynamic code execution, DOM injection, data exfiltration, and obfuscation patterns.' :
                          'Full code scan complete.';

  return { storeVariant, storeLabel, storeTooltip, storeHasNote, codeVariant, codeLabel, codeTooltip };
}
