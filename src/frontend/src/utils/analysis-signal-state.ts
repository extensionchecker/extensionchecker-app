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
  /** True when store lookup requires Firefox AMO — UI should surface a note. */
  storeHasNote: boolean;
  codeVariant: SignalVariant;
  codeLabel: string;
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

  const storeHasNote = storeVariant === 'na';

  const codeVariant: SignalVariant =
    !codePerformed  ? 'na'      :
    budgetExhausted ? 'partial' : 'ok';

  const codeLabel =
    !codePerformed      ? 'Code'            :
    budgetExhausted     ? 'Code (Partial)'  :
    codeMode === 'lite' ? 'Code (Lite)'     : 'Code (Full)';

  return { storeVariant, storeLabel, storeHasNote, codeVariant, codeLabel };
}
