import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '@extensionchecker/shared';
import { buildPermissionDetails } from '../src/permission-explainer';

function buildReport(): AnalysisReport {
  return {
    reportVersion: '1.0.0',
    analyzedAt: '2026-03-12T00:00:00.000Z',
    source: {
      type: 'url',
      value: 'https://example.com/extension.zip'
    },
    metadata: {
      name: 'Permission Test Extension',
      version: '1.0.0',
      manifestVersion: 3
    },
    permissions: {
      requestedPermissions: ['tabs', 'cookies'],
      optionalPermissions: ['cookies'],
      hostPermissions: ['<all_urls>', 'https://example.com/*']
    },
    riskSignals: [],
    score: {
      value: 50,
      severity: 'high',
      rationale: 'Test'
    },
    summary: 'Test summary',
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: ['Manifest-first only']
    }
  };
}

describe('buildPermissionDetails', () => {
  it('includes requested, optional, and host entries sorted by severity', () => {
    const details = buildPermissionDetails(buildReport());

    expect(details.length).toBe(5);

    expect(details[0]?.severity).toBe('high');
    expect(details[1]?.severity).toBe('high');

    const requestedCookies = details.find((entry) => entry.id === 'requested:cookies');
    const optionalCookies = details.find((entry) => entry.id === 'optional:cookies');
    const broadHost = details.find((entry) => entry.id === 'host:<all_urls>');

    expect(requestedCookies?.severity).toBe('high');
    expect(optionalCookies?.severity).toBe('medium');
    expect(broadHost?.severity).toBe('high');

    const scopedHost = details.find((entry) => entry.id === 'host:https://example.com/*');
    expect(scopedHost?.severity).toBe('medium');
    expect(scopedHost?.sourceLabel).toBe('Host Access');
  });
});
