const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const DEFAULT_RATE_LIMIT_PER_MINUTE_PER_IP = 30;
const DEFAULT_RATE_LIMIT_PER_DAY_PER_IP = 2_000;
const DEFAULT_RATE_LIMIT_GLOBAL_PER_DAY = 90_000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOW_REQUESTS_WITHOUT_ORIGIN = false;

/**
 * Cloudflare Worker environment bindings and API feature flags.
 * Scraper feature flags live here because they are consumed by buildSecurityConfig
 * and passed through to scraper config builders.
 */
export type BackendSecurityEnv = {
  API_ALLOWED_ORIGINS?: string;
  API_RATE_LIMIT_PER_MINUTE_PER_IP?: string;
  API_RATE_LIMIT_PER_DAY_PER_IP?: string;
  API_RATE_LIMIT_GLOBAL_PER_DAY?: string;
  API_UPSTREAM_TIMEOUT_MS?: string;
  API_ALLOW_REQUESTS_WITHOUT_ORIGIN?: string;
  API_ACCESS_TOKEN?: string;
  // Per-store HTML scraper feature flags. Set to "false", "0", or "no" to
  // disable a scraper without disabling manifest-only fallback scoring.
  SCRAPER_CHROME_ENABLED?: string;
  SCRAPER_EDGE_ENABLED?: string;
  SCRAPER_OPERA_ENABLED?: string;
};

export type SecurityConfig = {
  allowedOrigins: Set<string>;
  rateLimitPerMinutePerIp: number;
  rateLimitPerDayPerIp: number;
  rateLimitGlobalPerDay: number;
  upstreamTimeoutMs: number;
  allowRequestsWithoutOrigin: boolean;
  apiAccessToken: string | null;
};

export type SecurityConfigInput = Partial<SecurityConfig>;

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  minValue = 1,
  maxValue = Number.MAX_SAFE_INTEGER
): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.floor(parsed);
  if (rounded < minValue || rounded > maxValue) {
    return fallback;
  }

  return rounded;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function normalizeOrigin(value: string): string | null {
  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const origins = new Set<string>();
  const values = raw
    ? raw.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : DEFAULT_ALLOWED_ORIGINS;

  for (const value of values) {
    const normalized = normalizeOrigin(value);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return origins;
}

export function buildSecurityConfig(env?: BackendSecurityEnv): SecurityConfig {
  return {
    allowedOrigins: parseAllowedOrigins(env?.API_ALLOWED_ORIGINS),
    rateLimitPerMinutePerIp: parsePositiveInt(env?.API_RATE_LIMIT_PER_MINUTE_PER_IP, DEFAULT_RATE_LIMIT_PER_MINUTE_PER_IP, 1, 10_000),
    rateLimitPerDayPerIp: parsePositiveInt(env?.API_RATE_LIMIT_PER_DAY_PER_IP, DEFAULT_RATE_LIMIT_PER_DAY_PER_IP, 1, 1_000_000),
    rateLimitGlobalPerDay: parsePositiveInt(env?.API_RATE_LIMIT_GLOBAL_PER_DAY, DEFAULT_RATE_LIMIT_GLOBAL_PER_DAY, 1, 10_000_000),
    upstreamTimeoutMs: parsePositiveInt(env?.API_UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS, 1_000, 120_000),
    allowRequestsWithoutOrigin: parseBoolean(env?.API_ALLOW_REQUESTS_WITHOUT_ORIGIN, DEFAULT_ALLOW_REQUESTS_WITHOUT_ORIGIN),
    apiAccessToken: env?.API_ACCESS_TOKEN?.trim() ? env.API_ACCESS_TOKEN.trim() : null
  };
}

export function mergeSecurityConfig(base: SecurityConfig, overrides?: SecurityConfigInput): SecurityConfig {
  if (!overrides) {
    return base;
  }

  return {
    allowedOrigins: overrides.allowedOrigins ? new Set(overrides.allowedOrigins) : base.allowedOrigins,
    rateLimitPerMinutePerIp: overrides.rateLimitPerMinutePerIp ?? base.rateLimitPerMinutePerIp,
    rateLimitPerDayPerIp: overrides.rateLimitPerDayPerIp ?? base.rateLimitPerDayPerIp,
    rateLimitGlobalPerDay: overrides.rateLimitGlobalPerDay ?? base.rateLimitGlobalPerDay,
    upstreamTimeoutMs: overrides.upstreamTimeoutMs ?? base.upstreamTimeoutMs,
    allowRequestsWithoutOrigin: overrides.allowRequestsWithoutOrigin ?? base.allowRequestsWithoutOrigin,
    apiAccessToken: overrides.apiAccessToken ?? base.apiAccessToken
  };
}
