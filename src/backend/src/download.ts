import { type PackageKind, detectPackageKind } from './archive';
import { ALLOWED_PACKAGE_EXTENSIONS, MAX_PACKAGE_SIZE_BYTES } from './constants';
import { resolveExtensionIdCandidates } from './id-resolution';
import { validatePublicFetchUrl, validateRedirectDestination } from './url-safety';
import type { AnalyzeSource } from './schemas';
import { readStreamBytesWithinLimit } from './bounded-stream-reader';

/**
 * Opera Add-ons lists "virtual" built-in browser features (WhatsApp sidebar,
 * VPN, ad-blocker, etc.) alongside real installable extensions. Virtual
 * extensions have no downloadable CRX package, so their download endpoint
 * returns 404. Their listing pages serve static assets from this CDN path.
 */
const OPERA_VIRTUAL_MARKER = 'maidenpackage/virtual';
const OPERA_LISTING_BASE = 'https://addons.opera.com/en/extensions/details/';
const OPERA_LISTING_TIMEOUT_MS = 6_000;
const OPERA_LISTING_MAX_BYTES = 150_000;

/**
 * Returns true when the Opera Add-ons listing for the given slug is a
 * virtual built-in browser feature rather than a real installable extension.
 * Any network/parse failure returns false so the caller keeps the original
 * download error.
 */
async function isOperaVirtualExtension(
  slug: string,
  fetchImpl: typeof fetch
): Promise<boolean> {
  const listingUrl = `${OPERA_LISTING_BASE}${encodeURIComponent(slug)}/`;
  const validated = validatePublicFetchUrl(listingUrl);
  if (!validated.ok) return false;

  let response: Response;
  try {
    response = await fetchImpl(validated.url.toString(), {
      signal: AbortSignal.timeout(OPERA_LISTING_TIMEOUT_MS)
    });
  } catch {
    return false;
  }

  if (!response.ok) return false;

  // Read only up to OPERA_LISTING_MAX_BYTES to avoid buffering the full page.
  let text: string;
  try {
    const arrayBuffer = await response.arrayBuffer();
    const chunk = arrayBuffer.byteLength > OPERA_LISTING_MAX_BYTES
      ? arrayBuffer.slice(0, OPERA_LISTING_MAX_BYTES)
      : arrayBuffer;
    text = new TextDecoder().decode(chunk);
  } catch {
    return false;
  }

  return text.includes(OPERA_VIRTUAL_MARKER);
}

/**
 * Returns an enhanced error message when an Opera download 404 is caused by
 * the extension being a virtual built-in browser feature. Falls back to the
 * original message for real download failures or when the listing check fails.
 *
 * Exported so that the app layer can call it for URL-path downloads (which
 * bypass resolveAndDownloadExtensionId) without duplicating detection logic.
 */
export async function resolveOperaDownloadError(
  slug: string,
  originalMessage: string,
  fetchImpl: typeof fetch
): Promise<string> {
  if (!originalMessage.includes('(404)')) return originalMessage;
  const isVirtual = await isOperaVirtualExtension(slug, fetchImpl);
  if (!isVirtual) return originalMessage;
  return (
    `"${slug}" is a built-in Opera browser feature, not an installable extension. ` +
    'There is no extension package to analyze. ' +
    'Try a different Opera extension, or upload a .crx file if you have the package.'
  );
}

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

  // Re-validate the final URL after redirect resolution to defend against
  // SSRF via open redirects on store domains.  We only check for private/
  // loopback destinations and non-HTTP(S) protocols here — the allowlist was
  // already applied to the initial URL, and legitimate store downloads
  // frequently redirect to CDN hosts (including over HTTP) outside the
  // store-specific allowlist.  For example, Microsoft's Edge extension CDN
  // uses plain-HTTP CDN endpoints as the final download destination.
  //
  // Only run this check when response.url is non-empty: the WHATWG fetch
  // spec sets response.url to the final URL after redirect resolution, but
  // test environments that construct Response objects manually leave it as
  // an empty string.
  if (response.url) {
    const redirectReason = validateRedirectDestination(response.url);
    if (redirectReason !== null) {
      throw new Error(`Package download redirected to an unsafe destination: ${redirectReason}`);
    }
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
    if (response.body === null) {
      bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxBytes) {
        throw new Error(`Package exceeds size limit (${Math.round(maxBytes / (1024 * 1024))} MB max).`);
      }
    } else {
      const limitedBytes = await readStreamBytesWithinLimit(
        response.body,
        maxBytes,
        `Package exceeds size limit (${Math.round(maxBytes / (1024 * 1024))} MB max).`,
        signal
      );
      bytes = limitedBytes.slice().buffer;
    }
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
      const rawMessage = error instanceof Error ? error.message : 'Failed to download extension package.';

      // When Opera returns 404, check if this is a virtual built-in feature
      // (WhatsApp sidebar, VPN, ad-blocker, etc.) rather than a real extension.
      if (candidate.ecosystem === 'opera' && rawMessage.includes('(404)')) {
        lastErrorMessage = await resolveOperaDownloadError(candidate.canonicalId, rawMessage, fetchImpl);
        continue;
      }

      lastErrorMessage = rawMessage;
    }
  }

  throw new Error(lastErrorMessage);
}
