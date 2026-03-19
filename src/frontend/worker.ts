type AssetFetcher = {
  fetch: (request: Request) => Promise<Response>;
};

type BackendFetcher = {
  fetch: (request: Request) => Promise<Response>;
};

export type FrontendWorkerEnv = {
  ASSETS: AssetFetcher;
  BACKEND?: BackendFetcher;
  API_BACKEND_BASE_URL?: string;
  API_ACCESS_TOKEN?: string;
};

const FRONTEND_PERMISSIONS_POLICY = 'accelerometer=(), ambient-light-sensor=(), autoplay=(), browsing-topics=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';
const FRONTEND_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "connect-src 'self'",
  "img-src 'self' data: blob:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "worker-src 'self' blob:"
].join('; ');

function isBackendRoute(url: URL): boolean {
  return url.pathname === '/health' || url.pathname.startsWith('/api/');
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'x-content-type-options': 'nosniff'
    }
  });
}

function buildBackendRequest(request: Request, backendBaseUrl: string): Request {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(requestUrl.pathname + requestUrl.search, backendBaseUrl);
  return new Request(targetUrl.toString(), request);
}

function injectTokenHeader(request: Request, token: string | undefined): Request {
  if (!token?.trim()) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.set('x-extensionchecker-token', token.trim());
  return new Request(request, { headers });
}

function applyFrontendSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', FRONTEND_PERMISSIONS_POLICY);
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('x-dns-prefetch-control', 'off');
  headers.set('x-permitted-cross-domain-policies', 'none');

  if (headers.get('content-type')?.toLowerCase().includes('text/html')) {
    headers.set('content-security-policy', FRONTEND_CONTENT_SECURITY_POLICY);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export async function handleFrontendWorkerRequest(request: Request, env: FrontendWorkerEnv): Promise<Response> {
  const requestUrl = new URL(request.url);

  if (isBackendRoute(requestUrl)) {
    const authedRequest = injectTokenHeader(request, env.API_ACCESS_TOKEN);

    if (env.BACKEND) {
      return env.BACKEND.fetch(authedRequest);
    }

    if (env.API_BACKEND_BASE_URL) {
      return fetch(buildBackendRequest(authedRequest, env.API_BACKEND_BASE_URL));
    }

    return jsonError(
      'Frontend Worker is missing a backend target. Configure a BACKEND service binding or API_BACKEND_BASE_URL.',
      502
    );
  }

  const assetResponse = await env.ASSETS.fetch(request);
  return applyFrontendSecurityHeaders(assetResponse);
}

export default {
  fetch(request: Request, env: FrontendWorkerEnv): Promise<Response> {
    return handleFrontendWorkerRequest(request, env);
  }
};
