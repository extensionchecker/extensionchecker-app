import { createApp } from './app';
import type { BackendSecurityEnv } from './security';

let cachedApp: ReturnType<typeof createApp> | null = null;
let cachedConfigSignature: string | null = null;

function securitySignature(env: BackendSecurityEnv): string {
  return JSON.stringify({
    origins: env.API_ALLOWED_ORIGINS ?? '',
    rpmIp: env.API_RATE_LIMIT_PER_MINUTE_PER_IP ?? '',
    rpdIp: env.API_RATE_LIMIT_PER_DAY_PER_IP ?? '',
    rpdGlobal: env.API_RATE_LIMIT_GLOBAL_PER_DAY ?? '',
    upstreamTimeoutMs: env.API_UPSTREAM_TIMEOUT_MS ?? '',
    allowWithoutOrigin: env.API_ALLOW_REQUESTS_WITHOUT_ORIGIN ?? '',
    hasToken: Boolean(env.API_ACCESS_TOKEN && env.API_ACCESS_TOKEN.trim().length > 0)
  });
}

export default {
  fetch(request: Request, env: BackendSecurityEnv) {
    const signature = securitySignature(env);
    if (!cachedApp || signature !== cachedConfigSignature) {
      cachedApp = createApp({ env });
      cachedConfigSignature = signature;
    }

    return cachedApp.fetch(request);
  }
};
