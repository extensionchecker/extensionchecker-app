import { type PackageKind, detectPackageKind } from './archive';
import { ALLOWED_PACKAGE_EXTENSIONS, MAX_PACKAGE_SIZE_BYTES } from './constants';
import { resolveExtensionIdCandidates } from './id-resolution';
import { validatePublicFetchUrl } from './url-safety';
import type { AnalyzeSource } from './schemas';

export type DownloadedPackage = {
  bytes: ArrayBuffer;
  contentType: string | null;
};

export type ResolvedIdDownload = {
  downloaded: DownloadedPackage;
  packageUrl: URL;
  packageKindHint: PackageKind;
  source: AnalyzeSource;
};

export function hasAllowedPackageExtension(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return ALLOWED_PACKAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function pickPackageKindFromUpload(file: File): PackageKind {
  const safeFilename = file.name.length > 0 ? file.name : 'upload.zip';
  return detectPackageKind(new URL(`https://upload.local/${encodeURIComponent(safeFilename)}`), file.type);
}

export function isLikelyDirectPackageUrl(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.zip') || path.endsWith('.crx') || path.endsWith('.xpi')) {
    return true;
  }

  if (url.hostname.toLowerCase() === 'clients2.google.com' && path === '/service/update2/crx') {
    return true;
  }

  if (url.hostname.toLowerCase() === 'edge.microsoft.com' && path === '/extensionwebstorebase/v1/crx') {
    return true;
  }

  if (url.hostname.toLowerCase() === 'addons.mozilla.org' && path.includes('/downloads/latest/')) {
    return true;
  }

  return false;
}

export function parseContentLength(contentLengthHeader: string | undefined): number | null {
  if (!contentLengthHeader) {
    return null;
  }

  const parsed = Number(contentLengthHeader);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}

export function exceedsRequestSizeLimit(contentLengthHeader: string | undefined, maxBytes: number): boolean {
  const contentLength = parseContentLength(contentLengthHeader);
  if (contentLength === null) {
    return false;
  }

  return contentLength > maxBytes;
}

export async function downloadPackage(url: URL, fetchImpl: typeof fetch, timeoutMs: number, maxBytes: number): Promise<DownloadedPackage> {
  const signal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error.';
    throw new Error(`Failed to download extension package: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to download extension package (${response.status}).`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const declaredSize = Number(contentLength);
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new Error(`Package exceeds size limit (declared ${Math.round(declaredSize / (1024 * 1024))} MB).`);
    }
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    if (signal.aborted) {
      throw new Error('Extension package download timed out. The package may be very large. Try uploading the file directly instead.');
    }
    const message = error instanceof Error ? error.message : 'Unknown error reading response body.';
    throw new Error(`Failed to read extension package: ${message}`);
  }

  return { bytes, contentType: response.headers.get('content-type') };
}

export async function resolveAndDownloadExtensionId(
  rawId: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxBytes: number
): Promise<ResolvedIdDownload> {
  const candidates = resolveExtensionIdCandidates(rawId);
  let lastErrorMessage = 'Failed to download extension package.';

  for (const candidate of candidates) {
    const target = validatePublicFetchUrl(candidate.downloadUrl.toString());
    if (!target.ok) {
      lastErrorMessage = target.reason;
      continue;
    }

    try {
      const downloaded = await downloadPackage(target.url, fetchImpl, timeoutMs, maxBytes);
      return {
        downloaded,
        packageUrl: target.url,
        packageKindHint: candidate.packageKind,
        source: {
          type: 'id',
          value: `${candidate.ecosystem}:${candidate.canonicalId}`
        }
      };
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : 'Failed to download extension package.';
    }
  }

  throw new Error(lastErrorMessage);
}
