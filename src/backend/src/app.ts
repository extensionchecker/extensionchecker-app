import { Hono } from 'hono';
import { z } from 'zod';
import { analyzeManifest } from '@extensionchecker/engine';
import { AnalysisReportSchema } from '@extensionchecker/shared';
import { ALLOWED_PACKAGE_EXTENSIONS, MAX_PACKAGE_SIZE_BYTES, MAX_PACKAGE_SIZE_MEGABYTES } from './constants';
import { type PackageKind, detectPackageKind, extractManifestFromPackage } from './archive';
import { resolveExtensionIdToPackage } from './id-resolution';
import { resolveListingUrlToId } from './listing-url';
import { validatePublicFetchUrl } from './url-safety';

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

function buildReportFromManifest(manifestRaw: unknown, source: { type: 'url'; value: string } | { type: 'id'; value: string } | { type: 'file'; filename: string; mimeType: string }) {
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

export function createApp(): Hono {
  const app = new Hono();

  app.get('/health', (context) => context.json({ status: 'ok' }));

  app.post('/api/analyze', async (context) => {
    const body = await context.req.json().catch(() => null);
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

    const response = await fetch(packageUrl.toString());
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
