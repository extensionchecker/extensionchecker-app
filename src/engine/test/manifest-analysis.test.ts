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

  it('populates permissionsScore equal to the manifest-only score', () => {
    const report = analyzeManifest(
      {
        name: 'Score Check Extension',
        version: '1.0.0',
        manifest_version: 3,
        permissions: ['cookies'],
        host_permissions: ['<all_urls>']
      },
      {
        type: 'url',
        value: 'https://example.com/score-check.zip'
      }
    );

    expect(report.permissionsScore).toBeDefined();
    expect(report.permissionsScore).toBe(report.score.value);
  });

  it('adds externally connectable signal when manifest exposes external surfaces', () => {
    const report = analyzeManifest(
      {
        name: 'Externally Connectable Extension',
        version: '1.0.0',
        manifest_version: 3,
        permissions: ['storage'],
        externally_connectable: {
          matches: ['https://example.com/*'],
          ids: ['abcdefghijklmnopabcdefghijklmnop']
        }
      },
      {
        type: 'id',
        value: 'chrome:abcdefghijklmnopabcdefghijklmnop'
      }
    );

    expect(report.riskSignals.some((signal) => signal.id === 'externally-connectable')).toBe(true);
  });

  it('caps score at 100 for heavily privileged manifests', () => {
    const report = analyzeManifest(
      {
        name: 'Very Risky Extension',
        version: '1.0.0',
        manifest_version: 3,
        permissions: ['cookies', 'webRequest', 'webRequestBlocking', 'debugger', 'management', 'nativeMessaging'],
        host_permissions: ['<all_urls>'],
        content_scripts: [{ matches: ['<all_urls>'] }]
      },
      {
        type: 'url',
        value: 'https://example.com/very-risky.zip'
      }
    );

    expect(report.score.value).toBe(100);
    expect(report.score.severity).toBe('critical');
  });
});
