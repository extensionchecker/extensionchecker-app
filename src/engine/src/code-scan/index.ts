/**
 * Public API for the engine's lite code scan module.
 *
 * Exports the scanner orchestrator and the signals aggregator so the backend
 * can run the full scan pipeline without importing internal detector modules.
 */
export { scanJsFile } from './scanner';
export { aggregateCodeFindings } from './signals';
export type { CodeFinding, CodeFindingRule, CodeScanResult, JsFileEntry } from './types';
