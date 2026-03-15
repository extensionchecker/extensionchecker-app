/**
 * Internal types for the lite regex-based JS code scanner.
 *
 * These types flow from detector functions → scanner → signal aggregator → report builder.
 * They are exported from the engine's public API so the backend can build and pass
 * CodeScanResult without duplicating type definitions.
 */

/** Every pattern detected by a detector function is identified by a string rule id. */
export type CodeFindingRule =
  | 'eval_usage'
  | 'dynamic_function'
  | 'setTimeout_string'
  | 'setInterval_string'
  | 'innerHTML_assignment'
  | 'outerHTML_assignment'
  | 'insertAdjacentHTML'
  | 'document_write'
  | 'remote_script_injection'
  | 'cookie_read'
  | 'clipboard_access'
  | 'password_field_access'
  | 'sendBeacon_exfiltration'
  | 'websocket_exfiltration'
  | 'chrome_debugger_api'
  | 'chrome_proxy_api'
  | 'chrome_cookies_api'
  | 'chrome_management_api'
  | 'chrome_webrequest_api'
  | 'obfuscation_atob'
  | 'obfuscation_eval_pack'
  | 'obfuscation_hex_array'
  | 'message_eval_chain';

/** A single pattern match within a JS source file. */
export interface CodeFinding {
  rule: CodeFindingRule;
  /** Path of the JS file within the archive (relative, no leading slash). */
  file: string;
  /** 1-based line number of the first match. */
  line: number;
  /** Raw matched snippet, truncated to 120 characters for display. */
  snippet: string;
}

/** An individual JS file passed into the scanner. */
export interface JsFileEntry {
  /** Relative path within the archive. */
  path: string;
  /** Decoded UTF-8 content. */
  content: string;
}

/**
 * Result produced by the backend after running the lite scan over all selected
 * JS files, then passed into the engine's aggregation functions and the report builder.
 */
export interface CodeScanResult {
  mode: 'none' | 'lite' | 'full';
  findings: CodeFinding[];
  filesScanned: number;
  filesSkipped: number;
  bytesScanned: number;
  /** True when the scan stopped early due to byte, file-count, or wall-clock budget. */
  budgetExhausted: boolean;
}
