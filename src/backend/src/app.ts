import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AnalysisProgressStep } from '@extensionchecker/shared';
import { MAX_PACKAGE_SIZE_BYTES, MAX_PACKAGE_SIZE_MEGABYTES } from './constants';
import { type PackageKind, detectPackageKind, extractManifestFromPackage } from './archive';
import { resolveExtensionIdCandidates, type ResolvedExtensionId } from './id-resolution';
import { resolveListingUrlToId } from './listing-url';
import { isSafariAppStoreHost, validatePublicFetchUrl } from './url-safety';
import {
  InMemoryRateLimiter,
  buildSecurityConfig,
  isJsonContentType,
  isMultipartContentType,
  mergeSecurityConfig,
  type BackendSecurityEnv,
  type SecurityConfigInput
} from './security';
import { AnalyzeRequestSchema, type ManifestCandidate } from './schemas';
import {
  type DownloadedPackage,
  downloadPackage,
  exceedsRequestSizeLimit,
  hasAllowedPackageExtension,
  isLikelyDirectPackageUrl,
  pickPackageKindFromUpload,
  resolveAndDownloadExtensionId
} from './download';
import { buildReportFromManifest } from './report';
import { dispatchStoreDataFetch } from './scrapers/index';
import { buildScraperConfig, type ScraperConfig } from './scrapers/scraper-config';
import type { KvNamespace } from './scrapers/kv-cache';
import { registerSecurityHeaders, registerApiMiddleware } from './middleware';

const MAX_ANALYZE_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_UPLOAD_REQUEST_BODY_BYTES = MAX_PACKAGE_SIZE_BYTES + (2 * 1024 * 1024);

/**
 * Extracts the Firefox add-on slug or ID from a resolved source string of the
 * form "firefox:<slug>". Returns null for all other ecosystems.
 *
 * @deprecated Use dispatchStoreDataFetch which handles all ecosystems.
 */
function extractFirefoxAddonId(sourceValue: string): string | null {
  if (!sourceValue.startsWith('firefox:')) {
    return null;
  }
  const slug = sourceValue.slice('firefox:'.length).trim();
  return slug.length > 0 ? slug : null;
}

export type CreateAppOptions = {
  securityConfig?: SecurityConfigInput;
  fetchImpl?: typeof fetch;
  now?: () => number;
  env?: BackendSecurityEnv;
  /** Override scraper feature flags (useful in tests without setting env strings). */
  scraperConfig?: ScraperConfig;
  /** Optional KV namespace for caching scraped store metadata. */
  kv?: KvNamespace | null;
};

function wantsEventStream(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/event-stream');
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const securityConfig = mergeSecurityConfig(buildSecurityConfig(options.env), options.securityConfig);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const rateLimiter = new InMemoryRateLimiter();
  const scraperConfig = options.scraperConfig ?? buildScraperConfig(options.env);
  const kv = options.kv ?? null;
  const app = new Hono();

  app.onError((error, context) => {
    console.error('Unhandled backend error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return context.json({ error: message }, 500);
  });

  registerSecurityHeaders(app);
  registerApiMiddleware(app, securityConfig, rateLimiter, now);

  app.get('/health', (context) => context.json({ status: 'ok' }));

  app.post('/api/analyze', async (context) => {
    if (!isJsonContentType(context.req.header('content-type'))) {
      return context.json({ error: 'Content-Type must be application/json.' }, 415);
    }

    if (exceedsRequestSizeLimit(context.req.header('content-length'), MAX_ANALYZE_REQUEST_BODY_BYTES)) {
      return context.json({ error: 'Analyze request body is too large.' }, 413);
    }

    const rawBody = await context.req.text().catch(() => null);
    if (rawBody === null) {
      return context.json({ error: 'Invalid request body.' }, 400);
    }

    if (new TextEncoder().encode(rawBody).byteLength > MAX_ANALYZE_REQUEST_BODY_BYTES) {
      return context.json({ error: 'Analyze request body is too large.' }, 413);
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
    }

    if (!streaming) {
      // Kick off store metadata fetch in parallel with package download.
      // Works for Firefox (AMO API), Chrome, Edge, and Opera (HTML scrapers).
      // Failure is always non-fatal — the report falls back gracefully.
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
          const message = error instanceof Error ? error.message : 'Failed to download extension package.';
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

      let reportResult: ReturnType<typeof buildReportFromManifest>;
      try {
        reportResult = buildReportFromManifest(manifestRaw, source, downloaded.bytes.byteLength, storeResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Report generation failed.';
        return context.json({ error: message }, 500);
      }

      if (!reportResult.ok) {
        return reportResult.response;
      }

      return context.json(reportResult.report, 200);
    }

    // --- SSE streaming path ---
    const capturedPackageUrl = packageUrl;
    const capturedPackageKindHint = packageKindHint;
    const capturedSource = source;
    const capturedDownloadedFromId = downloadedFromId;

    // Start the store metadata fetch now so it runs in parallel with SSE download.
    const capturedStoreDataPromise = capturedSource.type === 'id'
      ? dispatchStoreDataFetch(capturedSource.value, fetchImpl, securityConfig.upstreamTimeoutMs, scraperConfig, kv)
      : Promise.resolve({ attempted: false as const });

    return streamSSE(context, async (stream) => {
      const emitProgress = async (step: AnalysisProgressStep, message: string, percent: number): Promise<void> => {
        await stream.writeSSE({ event: 'progress', data: JSON.stringify({ step, message, percent }) });
      };

      try {
        await emitProgress('resolving', 'Resolving extension source…', 10);

        await emitProgress('downloading', 'Downloading extension package…', 20);

        let downloaded: DownloadedPackage;
        if (capturedDownloadedFromId) {
          downloaded = capturedDownloadedFromId;
        } else {
          try {
            downloaded = await downloadPackage(capturedPackageUrl, fetchImpl, securityConfig.upstreamTimeoutMs, MAX_PACKAGE_SIZE_BYTES);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to download extension package.';
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
            return;
          }
        }

        if (downloaded.bytes.byteLength > MAX_PACKAGE_SIZE_BYTES) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: `Package exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }) });
          return;
        }

        await emitProgress('extracting', 'Extracting manifest from package…', 60);

        const packageKind = capturedPackageKindHint ?? detectPackageKind(capturedPackageUrl, downloaded.contentType);

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
        const reportResult = buildReportFromManifest(manifestRaw, capturedSource, downloaded.bytes.byteLength, storeResult);
        if (!reportResult.ok) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Internal report contract violation.' }) });
          return;
        }

        await emitProgress('complete', 'Analysis complete.', 100);
        await stream.writeSSE({ event: 'result', data: JSON.stringify(reportResult.report) });
      } catch (error) {
        console.error('Unhandled SSE stream error:', error);
        const message = error instanceof Error ? error.message : 'Unexpected stream error.';
        try {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) });
        } catch {
          // Stream already closed; nothing more we can do.
        }
      }
    });
  });

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
      let manifestRaw: ManifestCandidate;
      try {
        manifestRaw = extractManifestFromPackage(await uploaded.arrayBuffer(), packageKind) as ManifestCandidate;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Package parsing failed.';
        return context.json({ error: message }, 400);
      }

      const source = {
        type: 'file' as const,
        filename: uploaded.name,
        mimeType: uploaded.type || 'application/octet-stream'
      };

      const reportResult = buildReportFromManifest(manifestRaw, source, uploaded.size);
      if (!reportResult.ok) {
        return reportResult.response;
      }

      return context.json(reportResult.report, 200);
    }

    // --- SSE streaming path ---
    return streamSSE(context, async (stream) => {
      const emitProgress = async (step: AnalysisProgressStep, message: string, percent: number): Promise<void> => {
        await stream.writeSSE({ event: 'progress', data: JSON.stringify({ step, message, percent }) });
      };

      try {
        await emitProgress('extracting', 'Extracting manifest from package…', 40);

        let manifestRaw: ManifestCandidate;
        try {
          manifestRaw = extractManifestFromPackage(await uploaded.arrayBuffer(), packageKind) as ManifestCandidate;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Package parsing failed.';
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: msg }) });
          return;
        }

        await emitProgress('analyzing', 'Analyzing manifest and permissions…', 70);

        const source = {
          type: 'file' as const,
          filename: uploaded.name,
          mimeType: uploaded.type || 'application/octet-stream'
        };

        const reportResult = buildReportFromManifest(manifestRaw, source, uploaded.size);
        if (!reportResult.ok) {
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Internal report contract violation.' }) });
          return;
        }

        await emitProgress('complete', 'Analysis complete.', 100);
        await stream.writeSSE({ event: 'result', data: JSON.stringify(reportResult.report) });
      } catch {
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Unexpected stream error.' }) });
      }
    });
  });

  return app;
}
