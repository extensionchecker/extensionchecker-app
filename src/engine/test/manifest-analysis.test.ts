import { describe, expect, it } from 'vitest';
import { analyzeManifest } from '../src/manifest-analysis';

describe('analyzeManifest', () => {
  it('detects broad host access and cookie combination', () => {
    const report = analyzeManifest(
      {
        name: 'Risky Extension',
        version: '1.0.0',
        manifest_version: 3,
        permissions: ['cookies', 'storage'],
        host_permissions: ['<all_urls>'],
        content_scripts: [{
          matches: ['<all_urls>'],
          js: ['content.js']
        }]
      },
      {
        type: 'url',
        value: 'https://example.com/risky.zip'
      }
    );

    expect(report.score.value).toBeGreaterThanOrEqual(70);
    expect(report.riskSignals.some((signal) => signal.id === 'broad-host-access')).toBe(true);
    expect(report.riskSignals.some((signal) => signal.id === 'cookie-access-with-broad-hosts')).toBe(true);
  });

  it('treats MV2 host permissions declared in permissions as host access', () => {
    const report = analyzeManifest(
      {
        name: 'MV2 Extension',
        version: '2.0.0',
        manifest_version: 2,
        permissions: ['https://*/*', 'tabs']
      },
      {
        type: 'url',
        value: 'https://example.com/mv2.zip'
      }
    );

    expect(report.permissions.hostPermissions).toContain('https://*/*');
    expect(report.permissions.requestedPermissions).toContain('tabs');
  });

  it('returns a low-risk report when no elevated capabilities are declared', () => {
    const report = analyzeManifest(
      {
        name: 'Simple Extension',
        version: '0.0.1',
        manifest_version: 3,
        permissions: ['storage']
      },
      {
        type: 'url',
        value: 'https://example.com/simple.zip'
      }
    );

    expect(report.score.severity).toBe('low');
    expect(report.riskSignals.length).toBe(0);
  });
});
