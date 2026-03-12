import { Hono } from 'hono';
import { z } from 'zod';
import { analyzeManifest } from '@extensionchecker/engine';
import { AnalysisReportSchema } from '@extensionchecker/shared';
import { ALLOWED_PACKAGE_EXTENSIONS, MAX_PACKAGE_SIZE_BYTES, MAX_PACKAGE_SIZE_MEGABYTES } from './constants';
import { type PackageKind, detectPackageKind, extractManifestFromPackage } from './archive';
import { resolveExtensionIdToPackage } from './id-resolution';
import { resolveListingUrlToId } from './listing-url';
import { isSafariAppStoreHost, validatePublicFetchUrl } from './url-safety';
import {
  InMemoryRateLimiter,
  buildRateLimitErrorMessage,
  buildSecurityConfig,
  hasValidApiAccessToken,
  isJsonContentType,
  isMultipartContentType,
  isOriginAllowed,
  mergeSecurityConfig,
  parseRequestOrigin,
  resolveClientKey,
  type BackendSecurityEnv,
  type SecurityConfigInput
} from './security';

const AnalyzeRequestSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('url'),
      value: z.string().url()
    }),
    z.object({
      type: z.literal('id'),
      value: z.string().min(1)
    })
  ])
});

const MAX_ANALYZE_REQUEST_BODY_BYTES = 16 * 1024;
const MAX_UPLOAD_REQUEST_BODY_BYTES = MAX_PACKAGE_SIZE_BYTES + (2 * 1024 * 1024);

type ManifestCandidate = {
  name?: unknown;
  version?: unknown;
  manifest_version?: unknown;
  permissions?: unknown;
  optional_permissions?: unknown;
  host_permissions?: unknown;
  content_scripts?: unknown;
  externally_connectable?: unknown;
};

type AnalyzeSource = { type: 'url'; value: string } | { type: 'id'; value: string };
type UploadSource = { type: 'file'; filename: string; mimeType: string };
type ReportSource = AnalyzeSource | UploadSource;

export type CreateAppOptions = {
  securityConfig?: SecurityConfigInput;
  fetchImpl?: typeof fetch;
  now?: () => number;
  env?: BackendSecurityEnv;
};

const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  manifest_version: z.number().int().min(2).max(3),
  permissions: z.array(z.string()).optional(),
  optional_permissions: z.array(z.string()).optional(),
  host_permissions: z.array(z.string()).optional(),
  content_scripts: z.array(
    z.object({
      matches: z.array(z.string()).optional(),
      js: z.array(z.string()).optional()
    })
  ).optional(),
  externally_connectable: z.object({
    matches: z.array(z.string()).optional(),
    ids: z.array(z.string()).optional()
  }).optional()
});

function hasAllowedPackageExtension(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return ALLOWED_PACKAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function pickPackageKindFromUpload(file: File): PackageKind {
  const safeFilename = file.name.length > 0 ? file.name : 'upload.zip';
  return detectPackageKind(new URL(`https://upload.local/${encodeURIComponent(safeFilename)}`), file.type);
}

function isLikelyDirectPackageUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.zip') || path.endsWith('.crx') || path.endsWith('.xpi')) {
    return true;
  }

  if (url.hostname.toLowerCase() === 'clients2.google.com' && path === '/service/update2/crx') {
    return true;
  }

  if (url.hostname.toLowerCase() === 'addons.mozilla.org' && path.includes('/downloads/latest/')) {
    return true;
  }

  return false;
}

function parseContentLength(contentLengthHeader: string | undefined): number | null {
  if (!contentLengthHeader) {
    return null;
  }

  const parsed = Number(contentLengthHeader);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}

function exceedsRequestSizeLimit(contentLengthHeader: string | undefined, maxBytes: number): boolean {
  const contentLength = parseContentLength(contentLengthHeader);
  if (contentLength === null) {
    return false;
  }

  return contentLength > maxBytes;
}

async function downloadPackage(url: URL, fetchImpl: typeof fetch, timeoutMs: number): Promise<Response> {
  try {
    return await fetchImpl(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error.';
    throw new Error(`Failed to download extension package: ${message}`);
  }
}

function buildReportFromManifest(manifestRaw: unknown, source: ReportSource) {
  const parsedManifest = ManifestSchema.safeParse(manifestRaw);
  if (!parsedManifest.success) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: 'manifest.json is missing required fields or has invalid structure.' }), {
        status: 400,
        headers: {
          'content-type': 'application/json'
        }
      })
    };
  }

  const report = analyzeManifest(parsedManifest.data, source);
  const validatedReport = AnalysisReportSchema.safeParse(report);
  if (!validatedReport.success) {
    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: 'Internal report contract violation.' }), {
        status: 500,
        headers: {
          'content-type': 'application/json'
        }
      })
    };
  }

  return {
    ok: true as const,
    report: validatedReport.data
  };
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const securityConfig = mergeSecurityConfig(buildSecurityConfig(options.env), options.securityConfig);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const rateLimiter = new InMemoryRateLimiter();
  const app = new Hono();

  app.use('*', async (context, next) => {
    await next();

    context.header('x-content-type-options', 'nosniff');
    context.header('x-frame-options', 'DENY');
    context.header('referrer-policy', 'no-referrer');
    context.header('cross-origin-resource-policy', 'same-origin');
    context.header('cross-origin-opener-policy', 'same-origin');
  });

  app.use('/api/*', async (context, next) => {
    context.header('cache-control', 'no-store');

    const rawOrigin = context.req.header('origin');
    const parsedOrigin = parseRequestOrigin(rawOrigin);
    if (rawOrigin && !parsedOrigin) {
      return context.json({ error: 'Origin header is malformed.' }, 400);
    }

    const hasConfiguredToken = typeof securityConfig.apiAccessToken === 'string' && securityConfig.apiAccessToken.length > 0;
    const hasValidToken = hasValidApiAccessToken(context.req.raw.headers, securityConfig.apiAccessToken);
    const hasTokenBypassForMissingOrigin = hasConfiguredToken && hasValidToken;
    const requestUrl = new URL(context.req.url);
    if (parsedOrigin && !isOriginAllowed(parsedOrigin, requestUrl, securityConfig.allowedOrigins)) {
      return context.json({ error: 'Request origin is not allowed for this API.' }, 403);
    }

    if (!parsedOrigin && !securityConfig.allowRequestsWithoutOrigin && !hasTokenBypassForMissingOrigin) {
      return context.json({
        error: 'Origin header is required for this API. Use the scanner UI or configure API_ALLOW_REQUESTS_WITHOUT_ORIGIN=true for trusted server-to-server usage.'
      }, 403);
    }

    if (parsedOrigin) {
      context.header('access-control-allow-origin', parsedOrigin);
      context.header('vary', 'Origin');
      context.header('access-control-allow-methods', 'POST, OPTIONS');
      context.header('access-control-allow-headers', 'content-type, x-extensionchecker-token');
      context.header('access-control-max-age', '600');
    }

    if (context.req.method === 'OPTIONS') {
      return context.body(null, 204);
    }

    if (hasConfiguredToken && !hasValidToken) {
      return context.json({ error: 'Missing or invalid API access token.' }, 401);
    }

    const rateDecision = rateLimiter.consume(resolveClientKey(context.req.raw.headers), securityConfig, now());
    if (!rateDecision.ok) {
      context.header('retry-after', String(rateDecision.retryAfterSeconds));
      return context.json({ error: buildRateLimitErrorMessage(rateDecision.scope) }, 429);
    }

    context.header('x-ratelimit-limit-minute-ip', String(securityConfig.rateLimitPerMinutePerIp));
    context.header('x-ratelimit-remaining-minute-ip', String(rateDecision.remainingPerMinutePerIp));
    context.header('x-ratelimit-limit-day-ip', String(securityConfig.rateLimitPerDayPerIp));
    context.header('x-ratelimit-remaining-day-ip', String(rateDecision.remainingPerDayPerIp));
    context.header('x-ratelimit-limit-day-global', String(securityConfig.rateLimitGlobalPerDay));
    context.header('x-ratelimit-remaining-day-global', String(rateDecision.remainingGlobalPerDay));

    await next();
  });

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

    let packageUrl: URL;
    let packageKindHint: PackageKind | null = null;
    let source = parsedRequest.data.source;

    if (source.type === 'url') {
      const target = validatePublicFetchUrl(source.value);
      if (!target.ok) {
        return context.json({ error: target.reason }, 400);
      }

      packageUrl = target.url;
      if (isSafariAppStoreHost(target.url.hostname)) {
        return context.json({
          error: 'Safari App Store listing URLs cannot be analyzed directly because Apple does not expose a downloadable extension package from listing pages. Upload an extension archive you obtained separately (for example from developer build artifacts).'
        }, 400);
      }

      const resolvedIdFromListing = resolveListingUrlToId(target.url);
      if (resolvedIdFromListing) {
        let resolved;
        try {
          resolved = resolveExtensionIdToPackage(resolvedIdFromListing);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unsupported extension listing URL.';
          return context.json({ error: message }, 400);
        }

        const resolvedTarget = validatePublicFetchUrl(resolved.downloadUrl.toString());
        if (!resolvedTarget.ok) {
          return context.json({ error: resolvedTarget.reason }, 400);
        }

        packageUrl = resolvedTarget.url;
        packageKindHint = resolved.packageKind;
      } else if (!isLikelyDirectPackageUrl(target.url)) {
        return context.json({
          error: 'URL must be a supported extension listing or direct package download (.crx, .xpi, .zip). For unsupported sources, upload an extension archive obtained separately.'
        }, 400);
      }
    } else {
      let resolved;
      try {
        resolved = resolveExtensionIdToPackage(source.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unsupported extension identifier.';
        return context.json({ error: message }, 400);
      }

      const target = validatePublicFetchUrl(resolved.downloadUrl.toString());
      if (!target.ok) {
        return context.json({ error: target.reason }, 400);
      }

      packageUrl = target.url;
      packageKindHint = resolved.packageKind;
      source = {
        type: 'id',
        value: resolved.canonicalId
      };
    }

    let response: Response;
    try {
      response = await downloadPackage(packageUrl, fetchImpl, securityConfig.upstreamTimeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download extension package.';
      return context.json({ error: message }, 502);
    }

    if (!response.ok) {
      return context.json({ error: `Failed to download extension package (${response.status}).` }, 400);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = Number(contentLength);
      if (!Number.isNaN(size) && size > MAX_PACKAGE_SIZE_BYTES) {
        return context.json({ error: `Package exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }, 413);
      }
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_PACKAGE_SIZE_BYTES) {
      return context.json({ error: `Package exceeds ${MAX_PACKAGE_SIZE_MEGABYTES} MB limit.` }, 413);
    }

    const packageKind = packageKindHint ?? detectPackageKind(packageUrl, response.headers.get('content-type'));

    let manifestRaw: ManifestCandidate;
    try {
      manifestRaw = extractManifestFromPackage(bytes, packageKind) as ManifestCandidate;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Package parsing failed.';
      return context.json({ error: message }, 400);
    }

    const reportResult = buildReportFromManifest(manifestRaw, source);
    if (!reportResult.ok) {
      return reportResult.response;
    }

    return context.json(reportResult.report, 200);
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

    const packageKind = pickPackageKindFromUpload(uploaded);

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

    const reportResult = buildReportFromManifest(manifestRaw, source);
    if (!reportResult.ok) {
      return reportResult.response;
    }

    return context.json(reportResult.report, 200);
  });

  return app;
}
