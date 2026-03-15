export const MAX_PACKAGE_SIZE_MEGABYTES = 80;
export const MAX_PACKAGE_SIZE_BYTES = MAX_PACKAGE_SIZE_MEGABYTES * 1024 * 1024;
export const ALLOWED_PACKAGE_EXTENSIONS = ['.zip', '.xpi', '.crx'] as const;

/** Maximum size of the JSON body accepted by POST /api/analyze. */
export const MAX_ANALYZE_REQUEST_BODY_BYTES = 16 * 1024;

/** Maximum size of a multipart upload body (package + form overhead). */
export const MAX_UPLOAD_REQUEST_BODY_BYTES = MAX_PACKAGE_SIZE_BYTES + (2 * 1024 * 1024);
