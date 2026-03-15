export const MAX_PACKAGE_SIZE_MEGABYTES = 80;
export const MAX_PACKAGE_SIZE_BYTES = MAX_PACKAGE_SIZE_MEGABYTES * 1024 * 1024;
export const ALLOWED_PACKAGE_EXTENSIONS = ['.zip', '.xpi', '.crx'] as const;

/** Maximum size of the JSON body accepted by POST /api/analyze. */
export const MAX_ANALYZE_REQUEST_BODY_BYTES = 16 * 1024;

/** Maximum size of a multipart upload body (package + form overhead). */
export const MAX_UPLOAD_REQUEST_BODY_BYTES = MAX_PACKAGE_SIZE_BYTES + (2 * 1024 * 1024);

// --- Code scan budget constants ---

/** Total uncompressed bytes to scan across all JS files in one request. */
export const MAX_CODE_SCAN_BYTES_TOTAL = 500_000;

/** Maximum uncompressed size of a single JS file to accept for scanning. */
export const MAX_CODE_SCAN_BYTES_PER_FILE = 200_000;

/** Maximum number of JS files to scan per request. */
export const MAX_CODE_SCAN_FILES = 30;

/**
 * Wall-clock time budget for the entire JS extraction + scan phase (ms).
 * Conservative: actual CPU time is a fraction of this, but provides
 * a safety valve against unexpectedly slow file I/O or archive parsing.
 */
export const CODE_SCAN_WALL_CLOCK_BUDGET_MS = 3_000;
