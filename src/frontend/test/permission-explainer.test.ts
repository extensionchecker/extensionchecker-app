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

  it('demotes optional critical permissions to high', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = [];
    report.permissions.optionalPermissions = ['cookies'];
    report.permissions.hostPermissions = [];
    const details = buildPermissionDetails(report);

    const optionalCookies = details.find((entry) => entry.id === 'optional:cookies');
    expect(optionalCookies?.severity).toBe('medium');
    expect(optionalCookies?.explanation).toContain('at runtime');
    expect(optionalCookies?.danger).toContain('Potential impact');
  });

  it('demotes optional medium permissions to low', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = [];
    report.permissions.optionalPermissions = ['tabs'];
    report.permissions.hostPermissions = [];
    const details = buildPermissionDetails(report);

    const optionalTabs = details.find((entry) => entry.id === 'optional:tabs');
    expect(optionalTabs?.severity).toBe('low');
  });

  it('keeps optional low permissions as low', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = [];
    report.permissions.optionalPermissions = ['storage'];
    report.permissions.hostPermissions = [];
    const details = buildPermissionDetails(report);

    const optionalStorage = details.find((entry) => entry.id === 'optional:storage');
    expect(optionalStorage?.severity).toBe('low');
  });

  it('explains unknown permissions with a generic message', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = ['myCustomPerm'];
    report.permissions.optionalPermissions = [];
    report.permissions.hostPermissions = [];
    const details = buildPermissionDetails(report);

    const custom = details.find((entry) => entry.id === 'requested:myCustomPerm');
    expect(custom?.explanation).toContain('"myCustomPerm"');
    expect(custom?.severity).toBe('medium');
  });

  it('classifies specific single-domain host as low severity', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = [];
    report.permissions.optionalPermissions = [];
    report.permissions.hostPermissions = ['https://specific.example.com/path'];
    const details = buildPermissionDetails(report);

    const host = details.find((entry) => entry.id === 'host:https://specific.example.com/path');
    expect(host?.severity).toBe('low');
    expect(host?.explanation).toContain('specific host');
  });

  it('classifies broad host patterns as high severity', () => {
    const broadPatterns = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'];
    for (const pattern of broadPatterns) {
      const report = buildReport();
      report.permissions.requestedPermissions = [];
      report.permissions.optionalPermissions = [];
      report.permissions.hostPermissions = [pattern];
      const details = buildPermissionDetails(report);

      const host = details.find((entry) => entry.id === `host:${pattern}`);
      expect(host?.severity).toBe('high');
    }
  });

  it('classifies wildcard host patterns as medium severity', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = [];
    report.permissions.optionalPermissions = [];
    report.permissions.hostPermissions = ['https://*.example.com/*'];
    const details = buildPermissionDetails(report);

    const host = details.find((entry) => entry.id === 'host:https://*.example.com/*');
    expect(host?.severity).toBe('medium');
    expect(host?.explanation).toContain('wildcards');
  });

  it('sorts by severity then source then name', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = ['activeTab', 'cookies', 'tabs'];
    report.permissions.optionalPermissions = ['storage'];
    report.permissions.hostPermissions = ['<all_urls>'];
    const details = buildPermissionDetails(report);

    expect(details.length).toBe(5);

    // High severity first (cookies + <all_urls>), then medium (tabs), then low (activeTab, then optional:storage)
    const ids = details.map((d) => d.id);
    const cookiesIdx = ids.indexOf('requested:cookies');
    const tabsIdx = ids.indexOf('requested:tabs');
    const activeTabIdx = ids.indexOf('requested:activeTab');
    const storageIdx = ids.indexOf('optional:storage');
    const broadHostIdx = ids.indexOf('host:<all_urls>');

    // High severity items come before medium
    expect(cookiesIdx).toBeLessThan(tabsIdx);
    expect(broadHostIdx).toBeLessThan(tabsIdx);
    // Medium before low
    expect(tabsIdx).toBeLessThan(activeTabIdx);
    expect(tabsIdx).toBeLessThan(storageIdx);
  });

  it('handles all known permission types', () => {
    const knownPermissions = [
      'activeTab', 'tabs', 'cookies', 'webRequest', 'webRequestBlocking',
      'scripting', 'history', 'downloads', 'clipboardRead', 'clipboardWrite',
      'debugger', 'management', 'nativeMessaging', 'storage'
    ];

    const report = buildReport();
    report.permissions.requestedPermissions = knownPermissions;
    report.permissions.optionalPermissions = [];
    report.permissions.hostPermissions = [];
    const details = buildPermissionDetails(report);

    expect(details.length).toBe(knownPermissions.length);
    for (const detail of details) {
      expect(detail.explanation).toBeTruthy();
      expect(detail.danger).toBeTruthy();
    }
  });

  it('returns empty array when no permissions exist', () => {
    const report = buildReport();
    report.permissions.requestedPermissions = [];
    report.permissions.optionalPermissions = [];
    report.permissions.hostPermissions = [];
    const details = buildPermissionDetails(report);

    expect(details).toEqual([]);
  });
});
