import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter, buildRateLimitErrorMessage } from '../src/rate-limiter';
import { buildSecurityConfig, parseAllowedOrigins } from '../src/security-config';
import {
  hasValidApiAccessToken,
  isJsonContentType,
  isMultipartContentType,
  isOriginAllowed,
  parseRequestOrigin,
  resolveClientKey
} from '../src/security';

describe('security helpers', () => {
  it('parses configured allowed origins and ignores invalid values', () => {
    const origins = parseAllowedOrigins('https://example.com,not-a-url,http://localhost:5173');
    expect(origins.has('https://example.com')).toBe(true);
    expect(origins.has('http://localhost:5173')).toBe(true);
    expect(origins.has('not-a-url')).toBe(false);
  });

  it('builds defaults when env is absent', () => {
    const config = buildSecurityConfig();
    expect(config.rateLimitPerMinutePerIp).toBeGreaterThan(0);
    expect(config.rateLimitPerDayPerIp).toBeGreaterThan(0);
    expect(config.rateLimitGlobalPerDay).toBeGreaterThan(0);
    expect(config.allowedOrigins.size).toBeGreaterThan(0);
    expect(config.allowRequestsWithoutOrigin).toBe(false);
  });

  it('parses boolean security flags from env', () => {
    const config = buildSecurityConfig({
      API_ALLOW_REQUESTS_WITHOUT_ORIGIN: 'true'
    });

    expect(config.allowRequestsWithoutOrigin).toBe(true);
  });

  it('normalizes valid origin headers and rejects malformed origins', () => {
    expect(parseRequestOrigin('https://example.com/path?q=1')).toBe('https://example.com');
    expect(parseRequestOrigin('not-a-url')).toBeNull();
    expect(parseRequestOrigin(null)).toBeNull();
  });

  it('allows same-origin and configured origins', () => {
    const requestUrl = new URL('https://scanner.example/api/analyze');
    const allowed = new Set(['https://trusted.example']);

    expect(isOriginAllowed('https://scanner.example', requestUrl, allowed)).toBe(true);
    expect(isOriginAllowed('https://trusted.example', requestUrl, allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.example', requestUrl, allowed)).toBe(false);
    expect(isOriginAllowed(null, requestUrl, allowed)).toBe(true);
  });

  it('resolves client identity from cf-connecting-ip, then x-forwarded-for', () => {
    const first = new Headers({
      'cf-connecting-ip': '203.0.113.4',
      'x-forwarded-for': '198.51.100.5'
    });
    const second = new Headers({
      'x-forwarded-for': '198.51.100.10, 198.51.100.11'
    });

    expect(resolveClientKey(first)).toBe('203.0.113.4');
    expect(resolveClientKey(second)).toBe('198.51.100.10');
    expect(resolveClientKey(new Headers())).toBe('unknown');
    expect(resolveClientKey(new Headers({ 'x-forwarded-for': 'not-an-ip' }))).toBe('unknown');
  });

  it('validates optional access token headers', () => {
    const headers = new Headers({ 'x-extensionchecker-token': 'abc123' });
    expect(hasValidApiAccessToken(headers, null)).toBe(true);
    expect(hasValidApiAccessToken(headers, 'abc123')).toBe(true);
    expect(hasValidApiAccessToken(headers, 'wrong')).toBe(false);
  });

  it('detects json and multipart content types', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
    expect(isJsonContentType('text/plain')).toBe(false);

    expect(isMultipartContentType('multipart/form-data; boundary=123')).toBe(true);
    expect(isMultipartContentType('application/json')).toBe(false);
  });

  it('enforces per-minute, per-day, and global rate limits', () => {
    const limiter = new InMemoryRateLimiter();
    const now = Date.UTC(2026, 2, 12, 10, 0, 0);
    const config = {
      allowedOrigins: new Set<string>(),
      rateLimitPerMinutePerIp: 2,
      rateLimitPerDayPerIp: 3,
      rateLimitGlobalPerDay: 4,
      upstreamTimeoutMs: 1_000,
      allowRequestsWithoutOrigin: false,
      apiAccessToken: null
    };

    const first = limiter.consume('198.51.100.1', config, now);
    const second = limiter.consume('198.51.100.1', config, now);
    const minuteBlocked = limiter.consume('198.51.100.1', config, now);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(minuteBlocked.ok).toBe(false);
    if (!minuteBlocked.ok) {
      expect(minuteBlocked.scope).toBe('ip-minute');
      expect(minuteBlocked.retryAfterSeconds).toBeGreaterThan(0);
    }

    const afterMinute = now + 61_000;
    const dayThird = limiter.consume('198.51.100.1', config, afterMinute);
    const dayBlocked = limiter.consume('198.51.100.1', config, afterMinute);
    expect(dayThird.ok).toBe(true);
    expect(dayBlocked.ok).toBe(false);
    if (!dayBlocked.ok) {
      expect(dayBlocked.scope).toBe('ip-day');
    }

    const otherIpOne = limiter.consume('198.51.100.2', config, afterMinute);
    expect(otherIpOne.ok).toBe(true);
    const globalBlocked = limiter.consume('198.51.100.3', config, afterMinute);
    expect(globalBlocked.ok).toBe(false);
    if (!globalBlocked.ok) {
      expect(globalBlocked.scope).toBe('global-day');
    }
  });

  it('returns user-facing rate limit messages for each scope', () => {
    expect(buildRateLimitErrorMessage('ip-minute')).toMatch(/per-minute/);
    expect(buildRateLimitErrorMessage('ip-day')).toMatch(/daily quota/);
    expect(buildRateLimitErrorMessage('global-day')).toMatch(/Service rate limit reached/);
  });
});
