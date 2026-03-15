import type { SecurityConfig } from './security-config';

const MILLIS_PER_MINUTE = 60_000;
const MILLIS_PER_DAY = 86_400_000;

/** Maximum number of distinct client keys tracked before new ones are bucketed under "overflow". */
const MAX_TRACKED_CLIENT_KEYS = 20_000;

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

/** In-memory sliding-window rate limiter tracking per-IP and global request counts. */
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
