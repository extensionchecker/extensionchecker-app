import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AnalysisProgressStep } from '@extensionchecker/shared';
import { MAX_ANALYZE_REQUEST_BODY_BYTES, MAX_PACKAGE_SIZE_BYTES, MAX_PACKAGE_SIZE_MEGABYTES, MAX_CODE_SCAN_BYTES_TOTAL, MAX_CODE_SCAN_BYTES_PER_FILE, MAX_CODE_SCAN_FILES, CODE_SCAN_WALL_CLOCK_BUDGET_MS } from './constants';
import { type PackageKind, detectPackageKind, extractManifestFromPackage } from './archive';
import { extractJsFilesFromPackage } from './js-extractor';
import { scanJsFile } from '@extensionchecker/engine';
import type { CodeScanResult } from '@extensionchecker/engine';
import { resolveExtensionIdCandidates, type ResolvedExtensionId } from './id-resolution';
import { resolveListingUrlToId } from './listing-url';
import { isSafariAppStoreHost, validatePublicFetchUrl } from './url-safety';
import { isJsonContentType } from './security';
import { AnalyzeRequestSchema, type ManifestCandidate } from './schemas';
import {
  type DownloadedPackage,
  downloadPackage,
  exceedsRequestSizeLimit,
  isLikelyDirectPackageUrl,
  resolveAndDownloadExtensionId,
  resolveOperaDownloadError
} from './download';
import { buildReportFromManifest } from './report';
import { dispatchStoreDataFetch } from './scrapers/index';
import { wantsEventStream } from './middleware';
import type { RouteDeps } from './route-deps';
import { readRequestTextWithinLimit } from './bounded-stream-reader';

const JS_EXTRACTION_OPTIONS = {
  maxTotalBytes: MAX_CODE_SCAN_BYTES_TOTAL,
  maxFileBytes: MAX_CODE_SCAN_BYTES_PER_FILE,
  maxFiles: MAX_CODE_SCAN_FILES,
  wallClockBudgetMs: CODE_SCAN_WALL_CLOCK_BUDGET_MS
} as const;

/**
 * Runs the lite JS code scan over a downloaded package.
 * Returns a CodeScanResult that can be passed to buildReportFromManifest.
 * Errors are caught and surfaced as a zero-findings result to keep the
 * main analysis pipeline intact even if scanning fails.
 */
function runCodeScan(bytes: Uint8Array, packageKind: PackageKind, rawManifest: unknown): CodeScanResult {
  try {
    const extraction = extractJsFilesFromPackage(bytes, packageKind, rawManifest, JS_EXTRACTION_OPTIONS);
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
 * Registers the POST /api/analyze route onto the given Hono app.
 *
 * Accepts a JSON body with a `source` field that is either a URL or a
 * namespaced extension ID (e.g. "chrome:{id}").  Responds with an
 * AnalysisReport as JSON, or as a Server-Sent Events stream when the client
 * sends `Accept: text/event-stream`.
 */
export function registerAnalyzeRoute(app: Hono, deps: RouteDeps): void {
  const { fetchImpl, securityConfig, scraperConfig, kv } = deps;

  app.post('/api/analyze', async (context) => {
    if (!isJsonContentType(context.req.header('content-type'))) {
      return context.json({ error: 'Content-Type must be application/json.' }, 415);
    }

    if (exceedsRequestSizeLimit(context.req.header('content-length'), MAX_ANALYZE_REQUEST_BODY_BYTES)) {
      return context.json({ error: 'Analyze request body is too large.' }, 413);
    }

    const rawBody = await readRequestTextWithinLimit(
      context.req.raw,
      MAX_ANALYZE_REQUEST_BODY_BYTES,
      'Analyze request body is too large.'
    ).catch((error) => {
      if (error instanceof Error && error.message === 'Analyze request body is too large.') {
        return error.message;
      }

      return null;
    });

    if (rawBody === 'Analyze request body is too large.') {
      return context.json({ error: rawBody }, 413);
    }

    if (rawBody === null) {
      return context.json({ error: 'Invalid request body.' }, 400);
    }

    let body: unknown = null;
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = null;
      }
    }

    const parsedRequest = AnalyzeRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return context.json({ error: 'Invalid request body.' }, 400);
    }

    const streaming = wantsEventStream(context.req.header('accept'));

    let packageUrl: URL;
    let packageKindHint: PackageKind | null = null;
    let downloadedFromId: DownloadedPackage | null = null;
    // For streaming ID sources, resolve+download is deferred into the SSE
    // handler so progress events are emitted during the actual network I/O.
    let rawIdSourceForSse: string | null = null;
    let source = parsedRequest.data.source;

    if (source.type === 'url') {
      const target = validatePublicFetchUrl(source.value);
      if (!target.ok) {
        return context.json({ error: target.reason }, 400);
      }

      packageUrl = target.url;
      if (isSafariAppStoreHost(target.url.hostname)) {
        return context.json({
          error: 'Safari listing URLs cannot be analyzed directly. Upload the package instead.'
        }, 400);
      }

      const resolvedIdFromListing = resolveListingUrlToId(target.url);
      if (resolvedIdFromListing) {
        let resolved: ResolvedExtensionId | null = null;
        try {
          const candidates = resolveExtensionIdCandidates(resolvedIdFromListing);
          const listingHost = target.url.hostname.toLowerCase();
          resolved = candidates.find((candidate) => {
            if (listingHost === 'microsoftedge.microsoft.com') {
              return candidate.ecosystem === 'edge';
            }
            if (listingHost === 'addons.opera.com') {
              return candidate.ecosystem === 'opera';
            }
            if (listingHost === 'chromewebstore.google.com' || listingHost === 'chrome.google.com') {
              return candidate.ecosystem === 'chrome';
            }
            return candidate.ecosystem === 'firefox';
          }) ?? candidates[0] ?? null;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unsupported extension listing URL.';
          return context.json({ error: message }, 400);
        }

        if (!resolved) {
          return context.json({ error: 'Unsupported extension listing URL.' }, 400);
        }

        const resolvedTarget = validatePublicFetchUrl(resolved.downloadUrl.toString());
        if (!resolvedTarget.ok) {
          return context.json({ error: resolvedTarget.reason }, 400);
        }

        packageUrl = resolvedTarget.url;
        packageKindHint = resolved.packageKind;
        source = {
          type: 'id',
          value: `${resolved.ecosystem}:${resolved.canonicalId}`
        };
      } else if (!isLikelyDirectPackageUrl(target.url)) {
        return context.json({
          error: 'Unsupported URL. Only browser extension store URLs are supported, or upload the extension.'
        }, 400);
      }
    } else {
      if (!streaming) {
        // Non-streaming: resolve + download immediately so the JSON response
        // has everything it needs before we return.
        try {
          const resolved = await resolveAndDownloadExtensionId(
            source.value,
            fetchImpl,
            securityConfig.upstreamTimeoutMs,
            MAX_PACKAGE_SIZE_BYTES
          );
          downloadedFromId = resolved.downloaded;
          packageUrl = resolved.packageUrl;
          packageKindHint = resolved.packageKindHint;
          source = resolved.source;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unsupported extension identifier.';
          return context.json({ error: message }, 400);
        }
      } else {
        // Streaming: defer resolve+download into the SSE handler.  The
        // placeholder URL is never used — effectivePackageUrl is set after
        // resolution inside the stream callback.
        rawIdSourceForSse = source.value;
        packageUrl = new URL('https://resolve.local/');
      }
    }

    // --- Non-streaming (JSON) analysis pipeline ---
    if (!streaming) {
      const storeDataPromise = source.type === 'id'
        ? dispatchStoreDataFetch(source.value, fetchImpl, securityConfig.upstreamTimeoutMs, scraperConfig, kv)
        : Promise.resolve({ attempted: false as const });

      let downloaded: DownloadedPackage;
      if (downloadedFromId) {
        downloaded = downloadedFromId;
      } else {
        try {
          downloaded = await downloadPackage(packageUrl, fetchImpl, securityConfig.upstreamTimeoutMs, MAX_PACKAGE_SIZE_BYTES);
        } catch (error) {
          let message = error instanceof Error ? error.message : 'Failed to download extension package.';
          if (source.type === 'id' && source.value.startsWith('opera:')) {
            const slug = source.value.slice('opera:'.length);
            message = await resolveOperaDownloadError(slug, message, fetchImpl);
          }
          return context.json({ error: message }, 502);
        }
      }

      if (downloaded.bytes.byteLength > MAX_PACKAGE_SIZE_BYTES) {
        return context.json({ error: `Package exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }, 413);
      }

      const packageKind = packageKindHint ?? detectPackageKind(packageUrl, downloaded.contentType);

      let manifestRaw: ManifestCandidate;
      try {
        manifestRaw = extractManifestFromPackage(downloaded.bytes, packageKind) as ManifestCandidate;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Package parsing failed.';
        return context.json({ error: message }, 400);
      }

      const storeResult = await storeDataPromise;

      const codeScanResult = runCodeScan(new Uint8Array(downloaded.bytes), packageKind, manifestRaw);

      let reportResult: ReturnType<typeof buildReportFromManifest>;
      try {
        reportResult = buildReportFromManifest(manifestRaw, source, downloaded.bytes.byteLength, storeResult, codeScanResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Report generation failed.';
        return context.json({ error: message }, 500);
      }

      if (!reportResult.ok) {
        return reportResult.response;
      }

      return context.json(reportResult.report, 200);
    }

    // --- SSE streaming analysis pipeline ---

    // Capture mutable locals before entering the async stream callback.
    const capturedPackageUrl = packageUrl;
    const capturedPackageKindHint = packageKindHint;
    const capturedSource = source;
    const capturedDownloadedFromId = downloadedFromId;
    const capturedRawIdSourceForSse = rawIdSourceForSse;

    // Start the store metadata fetch before the stream opens so it runs in
    // parallel with the download.  For deferred ID sources, capturedSource
    // still holds the original namespaced ID (e.g. "opera:slug"), which is
    // exactly what dispatchStoreDataFetch needs.
    const capturedStoreDataPromise = capturedSource.type === 'id'
      ? dispatchStoreDataFetch(capturedSource.value, fetchImpl, securityConfig.upstreamTimeoutMs, scraperConfig, kv)
      : Promise.resolve({ attempted: false as const });

    return streamSSE(context, async (stream) => {
      const emitProgress = async (step: AnalysisProgressStep, message: string, percent: number): Promise<void> => {
        await stream.writeSSE({ event: 'progress', data: JSON.stringify({ step, message, percent }) });
      };

      try {
        await emitProgress('resolving', 'Resolving extension source…', 10);

        let downloaded: DownloadedPackage;
        let effectivePackageUrl = capturedPackageUrl;
        let effectivePackageKindHint = capturedPackageKindHint;
        let effectiveSource = capturedSource;

        if (capturedRawIdSourceForSse !== null) {
          // ID + streaming: resolve and download here so the client sees real
          // progress events during the network I/O.
          await emitProgress('downloading', 'Downloading extension package…', 20);
          try {
            const resolved = await resolveAndDownloadExtensionId(
              capturedRawIdSourceForSse,
              fetchImpl,
              securityConfig.upstreamTimeoutMs,
              MAX_PACKAGE_SIZE_BYTES
            );
            downloaded = resolved.downloaded;
            effectivePackageUrl = resolved.packageUrl;
            effectivePackageKindHint = resolved.packageKindHint;
            effectiveSource = resolved.source;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unsupported extension identifier.';
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
            return;
          }
        } else if (capturedDownloadedFromId) {
          // Pre-downloaded via the non-streaming ID path (defensive fallback).
          downloaded = capturedDownloadedFromId;
        } else {
          await emitProgress('downloading', 'Downloading extension package…', 20);
          try {
            downloaded = await downloadPackage(capturedPackageUrl, fetchImpl, securityConfig.upstreamTimeoutMs, MAX_PACKAGE_SIZE_BYTES);
          } catch (error) {
            let message = error instanceof Error ? error.message : 'Failed to download extension package.';
            if (capturedSource.type === 'id' && capturedSource.value.startsWith('opera:')) {
              const slug = capturedSource.value.slice('opera:'.length);
              message = await resolveOperaDownloadError(slug, message, fetchImpl);
            }
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
            return;
          }
        }

        if (downloaded.bytes.byteLength > MAX_PACKAGE_SIZE_BYTES) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: `Package exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }) });
          return;
        }

        await emitProgress('extracting', 'Extracting manifest from package…', 60);

        const packageKind = effectivePackageKindHint ?? detectPackageKind(effectivePackageUrl, downloaded.contentType);

        let manifestRaw: ManifestCandidate;
        try {
          manifestRaw = extractManifestFromPackage(downloaded.bytes, packageKind) as ManifestCandidate;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Package parsing failed.';
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
          return;
        }

        await emitProgress('analyzing', 'Analyzing manifest and permissions…', 80);

        const storeResult = await capturedStoreDataPromise;
        const codeScanResult = runCodeScan(new Uint8Array(downloaded.bytes), packageKind, manifestRaw);
        const reportResult = buildReportFromManifest(manifestRaw, effectiveSource, downloaded.bytes.byteLength, storeResult, codeScanResult);
        if (!reportResult.ok) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Internal report contract violation.' }) });
          return;
        }

        await emitProgress('complete', 'Analysis complete.', 100);
        await stream.writeSSE({ event: 'result', data: JSON.stringify(reportResult.report) });
      } catch (error) {
        console.error('Unhandled SSE stream error:', error);
        // Do NOT forward the raw error message to the client: unhandled errors
        // may contain internal paths, library versions, or other implementation
        // details.  Log the details server-side and return a generic message.
        try {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Unexpected analysis error.' }) });
        } catch {
          // Stream already closed; nothing more we can do.
        }
      }
    });
  });
}
