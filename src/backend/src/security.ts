const MILLIS_PER_MINUTE = 60_000;
const MILLIS_PER_DAY = 86_400_000;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const DEFAULT_RATE_LIMIT_PER_MINUTE_PER_IP = 30;
const DEFAULT_RATE_LIMIT_PER_DAY_PER_IP = 2_000;
const DEFAULT_RATE_LIMIT_GLOBAL_PER_DAY = 90_000;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOW_REQUESTS_WITHOUT_ORIGIN = false;
const MAX_CLIENT_KEY_LENGTH = 64;
const MAX_TRACKED_CLIENT_KEYS = 20_000;

const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^[0-9a-f:]+$/i;

export type BackendSecurityEnv = {
  API_ALLOWED_ORIGINS?: string;
  API_RATE_LIMIT_PER_MINUTE_PER_IP?: string;
  API_RATE_LIMIT_PER_DAY_PER_IP?: string;
  API_RATE_LIMIT_GLOBAL_PER_DAY?: string;
  API_UPSTREAM_TIMEOUT_MS?: string;
  API_ALLOW_REQUESTS_WITHOUT_ORIGIN?: string;
  API_ACCESS_TOKEN?: string;
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

export type RateLimitSuccess = {
  ok: true;
  remainingPerMinutePerIp: number;
  remainingPerDayPerIp: number;
  remainingGlobalPerDay: number;
};

export type RateLimitFailure = {
  ok: false;
  scope: 'ip-minute' | 'ip-day' | 'global-day';
  retryAfterSeconds: number;
};

export type RateLimitDecision = RateLimitSuccess | RateLimitFailure;

type CounterState = {
  dayWindowKey: number;
  minuteWindowKey: number;
  globalDayCount: number;
  perIpDayCount: Map<string, number>;
  perIpMinuteCount: Map<string, number>;
};

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

export function parseRequestOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeOrigin(value);
  return normalized;
}

export function isOriginAllowed(origin: string | null, requestUrl: URL, allowedOrigins: Set<string>): boolean {
  if (!origin) {
    return true;
  }

  return origin === requestUrl.origin || allowedOrigins.has(origin);
}

function isValidIpv4(address: string): boolean {
  if (!IPV4_REGEX.test(address)) {
    return false;
  }

  const parts = address.split('.').map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function isValidIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.length < 2 || normalized.length > MAX_CLIENT_KEY_LENGTH) {
    return false;
  }

  if (!normalized.includes(':')) {
    return false;
  }

  if (!IPV6_REGEX.test(normalized.replaceAll('::', ':'))) {
    return false;
  }

  return true;
}

function normalizeClientAddress(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim().replace(/^\[(.*)\]$/, '$1');
  if (trimmed.length < 2 || trimmed.length > MAX_CLIENT_KEY_LENGTH) {
    return null;
  }

  if (isValidIpv4(trimmed) || isValidIpv6(trimmed)) {
    return trimmed;
  }

  return null;
}

export function resolveClientKey(headers: Headers): string {
  const cfIp = normalizeClientAddress(headers.get('cf-connecting-ip'));
  if (cfIp) {
    return cfIp;
  }

  const xForwardedFor = headers.get('x-forwarded-for')?.split(',')[0];
  const forwardedIp = normalizeClientAddress(xForwardedFor);
  if (forwardedIp) {
    return forwardedIp;
  }

  return 'unknown';
}

function secondsUntilNextMinute(nowMillis: number): number {
  const currentMinuteStart = Math.floor(nowMillis / MILLIS_PER_MINUTE) * MILLIS_PER_MINUTE;
  const nextMinuteStart = currentMinuteStart + MILLIS_PER_MINUTE;
  return Math.max(1, Math.ceil((nextMinuteStart - nowMillis) / 1000));
}

function secondsUntilNextUtcDay(nowMillis: number): number {
  const currentDayStart = Math.floor(nowMillis / MILLIS_PER_DAY) * MILLIS_PER_DAY;
  const nextDayStart = currentDayStart + MILLIS_PER_DAY;
  return Math.max(1, Math.ceil((nextDayStart - nowMillis) / 1000));
}

export class InMemoryRateLimiter {
  private state: CounterState = {
    dayWindowKey: -1,
    minuteWindowKey: -1,
    globalDayCount: 0,
    perIpDayCount: new Map<string, number>(),
    perIpMinuteCount: new Map<string, number>()
  };

  consume(clientKey: string, config: SecurityConfig, nowMillis: number): RateLimitDecision {
    const dayKey = Math.floor(nowMillis / MILLIS_PER_DAY);
    if (dayKey !== this.state.dayWindowKey) {
      this.state.dayWindowKey = dayKey;
      this.state.globalDayCount = 0;
      this.state.perIpDayCount.clear();
    }

    const minuteKey = Math.floor(nowMillis / MILLIS_PER_MINUTE);
    if (minuteKey !== this.state.minuteWindowKey) {
      this.state.minuteWindowKey = minuteKey;
      this.state.perIpMinuteCount.clear();
    }

    if (this.state.globalDayCount >= config.rateLimitGlobalPerDay) {
      return {
        ok: false,
        scope: 'global-day',
        retryAfterSeconds: secondsUntilNextUtcDay(nowMillis)
      };
    }

    const normalizedClientKey = this.normalizeTrackedClientKey(clientKey);
    const dayCount = this.state.perIpDayCount.get(normalizedClientKey) ?? 0;
    if (dayCount >= config.rateLimitPerDayPerIp) {
      return {
        ok: false,
        scope: 'ip-day',
        retryAfterSeconds: secondsUntilNextUtcDay(nowMillis)
      };
    }

    const minuteCount = this.state.perIpMinuteCount.get(normalizedClientKey) ?? 0;
    if (minuteCount >= config.rateLimitPerMinutePerIp) {
      return {
        ok: false,
        scope: 'ip-minute',
        retryAfterSeconds: secondsUntilNextMinute(nowMillis)
      };
    }

    this.state.globalDayCount += 1;
    this.state.perIpDayCount.set(normalizedClientKey, dayCount + 1);
    this.state.perIpMinuteCount.set(normalizedClientKey, minuteCount + 1);

    return {
      ok: true,
      remainingPerMinutePerIp: Math.max(0, config.rateLimitPerMinutePerIp - (minuteCount + 1)),
      remainingPerDayPerIp: Math.max(0, config.rateLimitPerDayPerIp - (dayCount + 1)),
      remainingGlobalPerDay: Math.max(0, config.rateLimitGlobalPerDay - this.state.globalDayCount)
    };
  }

  private normalizeTrackedClientKey(clientKey: string): string {
    if (!this.state.perIpDayCount.has(clientKey) && this.state.perIpDayCount.size >= MAX_TRACKED_CLIENT_KEYS) {
      return 'overflow';
    }

    return clientKey;
  }
}

export function buildRateLimitErrorMessage(scope: RateLimitFailure['scope']): string {
  if (scope === 'ip-minute') {
    return 'Rate limit exceeded for this IP (per-minute quota). Please retry shortly.';
  }

  if (scope === 'ip-day') {
    return 'Rate limit exceeded for this IP (daily quota). Please retry after the daily reset.';
  }

  return 'Service rate limit reached for the day. Please retry after the daily reset window.';
}

export function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  return contentType.toLowerCase().startsWith('application/json');
}

export function isMultipartContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  return contentType.toLowerCase().startsWith('multipart/form-data');
}

export function hasValidApiAccessToken(headers: Headers, token: string | null): boolean {
  if (!token) {
    return true;
  }

  const presented = headers.get('x-extensionchecker-token')?.trim();
  return typeof presented === 'string' && presented.length > 0 && presented === token;
}
