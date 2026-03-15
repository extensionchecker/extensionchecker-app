import type { Hono } from 'hono';
import {
  InMemoryRateLimiter,
  buildRateLimitErrorMessage,
  hasValidApiAccessToken,
  isOriginAllowed,
  parseRequestOrigin,
  resolveClientKey,
  type SecurityConfig
} from './security';

export function registerSecurityHeaders(app: Hono): void {
  app.use('*', async (context, next) => {
    await next();

    context.header('x-content-type-options', 'nosniff');
    context.header('x-frame-options', 'DENY');
    context.header('referrer-policy', 'no-referrer');
    context.header('permissions-policy', 'accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
    context.header('cross-origin-resource-policy', 'same-origin');
    context.header('cross-origin-opener-policy', 'same-origin');
    context.header('strict-transport-security', 'max-age=31536000');
  });
}

export function registerApiMiddleware(
  app: Hono,
  securityConfig: SecurityConfig,
  rateLimiter: InMemoryRateLimiter,
  now: () => number
): void {
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
}

/** Returns true when the client has indicated it will accept a Server-Sent Events stream. */
export function wantsEventStream(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/event-stream');
}
