import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AnalysisProgressStep } from '@extensionchecker/shared';
import { MAX_PACKAGE_SIZE_BYTES, MAX_PACKAGE_SIZE_MEGABYTES, MAX_UPLOAD_REQUEST_BODY_BYTES, MAX_CODE_SCAN_BYTES_TOTAL, MAX_CODE_SCAN_BYTES_PER_FILE, MAX_CODE_SCAN_FILES, CODE_SCAN_WALL_CLOCK_BUDGET_MS } from './constants';
import { extractManifestFromPackage } from './archive';
import { extractJsFilesFromPackage } from './js-extractor';
import { scanJsFile } from '@extensionchecker/engine';
import type { CodeScanResult } from '@extensionchecker/engine';
import { isMultipartContentType } from './security';
import type { ManifestCandidate } from './schemas';
import { exceedsRequestSizeLimit, hasAllowedPackageExtension, pickPackageKindFromUpload } from './download';
import { buildReportFromManifest } from './report';
import { wantsEventStream } from './middleware';

const JS_EXTRACTION_OPTIONS = {
  maxTotalBytes: MAX_CODE_SCAN_BYTES_TOTAL,
  maxFileBytes: MAX_CODE_SCAN_BYTES_PER_FILE,
  maxFiles: MAX_CODE_SCAN_FILES,
  wallClockBudgetMs: CODE_SCAN_WALL_CLOCK_BUDGET_MS
} as const;

function runCodeScan(bytes: Uint8Array, rawManifest: unknown): CodeScanResult {
  try {
    const extraction = extractJsFilesFromPackage(bytes, 'zip', rawManifest, JS_EXTRACTION_OPTIONS);
    const findings = extraction.files.flatMap((file) => scanJsFile(file));
    const bytesScanned = extraction.files.reduce(
      (sum, f) => sum + new TextEncoder().encode(f.content).byteLength,
      0
    );

    return {
      mode: 'lite',
      findings,
      filesScanned: extraction.files.length,
      filesSkipped: extraction.filesSkipped,
      bytesScanned,
      budgetExhausted: extraction.budgetExhausted
    };
  } catch (error) {
    console.error('Code scan failed (non-fatal):', error);
    return {
      mode: 'lite',
      findings: [],
      filesScanned: 0,
      filesSkipped: 0,
      bytesScanned: 0,
      budgetExhausted: false
    };
  }
}

/**
 * Registers the POST /api/analyze/upload route onto the given Hono app.
 *
 * Accepts a multipart/form-data body with a single `file` field containing a
 * .zip, .xpi, or .crx package.  Responds with an AnalysisReport as JSON, or
 * as a Server-Sent Events stream when the client sends `Accept: text/event-stream`.
 */
export function registerUploadRoute(app: Hono): void {
  app.post('/api/analyze/upload', async (context) => {
    if (!isMultipartContentType(context.req.header('content-type'))) {
      return context.json({ error: 'Content-Type must be multipart/form-data for uploads.' }, 415);
    }

    if (exceedsRequestSizeLimit(context.req.header('content-length'), MAX_UPLOAD_REQUEST_BODY_BYTES)) {
      return context.json({ error: `Upload request exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }, 413);
    }

    const formData = await context.req.raw.formData().catch(() => null);
    const uploaded = formData?.get('file');

    if (!(uploaded instanceof File)) {
      return context.json({ error: 'Expected multipart field "file".' }, 400);
    }

    if (uploaded.size > MAX_PACKAGE_SIZE_BYTES) {
      return context.json({ error: `Package exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }, 413);
    }

    if (!hasAllowedPackageExtension(uploaded.name)) {
      return context.json({ error: 'Uploaded file extension must be .zip, .xpi, or .crx.' }, 400);
    }

    const streaming = wantsEventStream(context.req.header('accept'));
    const packageKind = pickPackageKindFromUpload(uploaded);

    if (!streaming) {
      const packageBytes = new Uint8Array(await uploaded.arrayBuffer());
      let manifestRaw: ManifestCandidate;
      try {
        manifestRaw = extractManifestFromPackage(packageBytes, packageKind) as ManifestCandidate;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Package parsing failed.';
        return context.json({ error: message }, 400);
      }

      const source = {
        type: 'file' as const,
        filename: uploaded.name,
        mimeType: uploaded.type || 'application/octet-stream'
      };

      const codeScanResult = runCodeScan(packageBytes, manifestRaw);
      const reportResult = buildReportFromManifest(manifestRaw, source, uploaded.size, { attempted: false }, codeScanResult);
      if (!reportResult.ok) {
        return reportResult.response;
      }

      return context.json(reportResult.report, 200);
    }

    return streamSSE(context, async (stream) => {
      const emitProgress = async (step: AnalysisProgressStep, message: string, percent: number): Promise<void> => {
        await stream.writeSSE({ event: 'progress', data: JSON.stringify({ step, message, percent }) });
      };

      try {
        await emitProgress('extracting', 'Extracting manifest from package…', 40);

        const packageBytes = new Uint8Array(await uploaded.arrayBuffer());
        let manifestRaw: ManifestCandidate;
        try {
          manifestRaw = extractManifestFromPackage(packageBytes, packageKind) as ManifestCandidate;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Package parsing failed.';
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
          return;
        }

        await emitProgress('analyzing', 'Analyzing manifest and permissions…', 80);

        const source = {
          type: 'file' as const,
          filename: uploaded.name,
          mimeType: uploaded.type || 'application/octet-stream'
        };

        const codeScanResult = runCodeScan(packageBytes, manifestRaw);
        const reportResult = buildReportFromManifest(manifestRaw, source, uploaded.size, { attempted: false }, codeScanResult);
        if (!reportResult.ok) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Internal report contract violation.' }) });
          return;
        }

        await emitProgress('complete', 'Analysis complete.', 100);
        await stream.writeSSE({ event: 'result', data: JSON.stringify(reportResult.report) });
      } catch (error) {
        console.error('Unhandled upload SSE stream error:', error);
        try {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Unexpected stream error.' }) });
        } catch {
          // Stream already closed; nothing more we can do.
        }
      }
    });
  });
}
