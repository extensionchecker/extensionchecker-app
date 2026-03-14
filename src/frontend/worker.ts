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
};

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

export async function handleFrontendWorkerRequest(request: Request, env: FrontendWorkerEnv): Promise<Response> {
  const requestUrl = new URL(request.url);

  if (isBackendRoute(requestUrl)) {
    if (env.BACKEND) {
      return env.BACKEND.fetch(request);
    }

    if (env.API_BACKEND_BASE_URL) {
      return fetch(buildBackendRequest(request, env.API_BACKEND_BASE_URL));
    }

    return jsonError(
      'Frontend Worker is missing a backend target. Configure a BACKEND service binding or API_BACKEND_BASE_URL.',
      502
    );
  }

  return env.ASSETS.fetch(request);
}

export default {
  fetch(request: Request, env: FrontendWorkerEnv): Promise<Response> {
    return handleFrontendWorkerRequest(request, env);
  }
};
