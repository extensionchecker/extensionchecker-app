import { describe, expect, it } from 'vitest';
import type { AnalysisReport } from '@extensionchecker/shared';
import { resolveExtensionDisplayName } from '../src/report-display';

type ReportSource = AnalysisReport['source'];

function buildReport(name: string, source: ReportSource): AnalysisReport {
  return {
    reportVersion: '1.0.0',
    analyzedAt: '2026-03-12T00:00:00.000Z',
    source,
    metadata: {
      name,
      version: '1.0.0',
      manifestVersion: 3
    },
    permissions: {
      requestedPermissions: [],
      optionalPermissions: [],
      hostPermissions: []
    },
    riskSignals: [],
    score: {
      value: 0,
      severity: 'low',
      rationale: 'test'
    },
    summary: 'test',
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: []
    }
  };
}

describe('resolveExtensionDisplayName', () => {
  it('returns manifest name when already resolved', () => {
    const report = buildReport('Real Extension Name', {
      type: 'url',
      value: 'https://example.com/extension.zip'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Real Extension Name');
  });

  it('falls back to listing slug from Firefox listing URL', () => {
    const report = buildReport('__MSG_ExtName__', {
      type: 'url',
      value: 'https://addons.mozilla.org/en-US/firefox/addon/sidebery/'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Sidebery');
  });

  it('falls back to short chrome identifier label for raw chrome ids', () => {
    const report = buildReport('__MSG_appName__', {
      type: 'id',
      value: 'abcdefghijklmnopabcdefghijklmnop'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Chrome Extension (abcdefgh...)');
  });

  it('falls back to a cleaned file name for uploads', () => {
    const report = buildReport('__MSG_name__', {
      type: 'file',
      filename: 'my-awesome-extension-package.xpi',
      mimeType: 'application/x-xpinstall'
    });

    expect(resolveExtensionDisplayName(report)).toBe('My Awesome Extension Package');
  });

  it('falls back to chrome listing slug when source is a chrome listing URL', () => {
    const report = buildReport('__MSG_name__', {
      type: 'url',
      value: 'https://chromewebstore.google.com/detail/adblock-plus-free-ad-blocker/cfhdojbkjhnklbpkdaibdccddilifddb'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Adblock Plus Free Ad Blocker');
  });

  it('falls back to unknown-name text when neither manifest nor source are usable', () => {
    const report = buildReport('__MSG_name__', {
      type: 'id',
      value: ''
    });

    expect(resolveExtensionDisplayName(report)).toBe('Extension name unavailable');
  });

  it('falls back to readable firefox and safari prefixed ids', () => {
    const firefoxReport = buildReport('__MSG_name__', {
      type: 'id',
      value: 'firefox:side-berry'
    });
    const safariReport = buildReport('__MSG_name__', {
      type: 'id',
      value: 'safari:focus-mode-helper'
    });

    expect(resolveExtensionDisplayName(firefoxReport)).toBe('Side Berry');
    expect(resolveExtensionDisplayName(safariReport)).toBe('Focus Mode Helper');
  });

  it('handles malformed encoded values without throwing', () => {
    const report = buildReport('__MSG_name__', {
      type: 'url',
      value: 'https://example.com/%E0%A4%A'
    });

    expect(resolveExtensionDisplayName(report)).toBe('%E0%A4%A');
  });

  it('falls back to edge listing slug from Edge store URL', () => {
    const report = buildReport('__MSG_name__', {
      type: 'url',
      value: 'https://microsoftedge.microsoft.com/addons/detail/dark-reader/ifoakfbpdcdoeenechcleahebpibofpc'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Dark Reader');
  });

  it('falls back to last URL segment for unknown store URLs', () => {
    const report = buildReport('__MSG_name__', {
      type: 'url',
      value: 'https://example.com/path/my-cool-addon'
    });

    expect(resolveExtensionDisplayName(report)).toBe('My Cool Addon');
  });

  it('returns null for URLs with no path segments', () => {
    const report = buildReport('__MSG_name__', {
      type: 'url',
      value: 'https://some-bare-host.com'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Extension name unavailable');
  });

  it('returns null for completely invalid URLs', () => {
    const report = buildReport('__MSG_name__', {
      type: 'url',
      value: 'not-a-url-at-all'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Extension name unavailable');
  });

  it('falls back to edge label for edge: prefixed chrome-pattern ID', () => {
    const report = buildReport('__MSG_name__', {
      type: 'id',
      value: 'edge:abcdefghijklmnopabcdefghijklmnop'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Edge Extension (abcdefgh...)');
  });

  it('falls back to normalized label for edge: prefixed non-chrome ID', () => {
    const report = buildReport('__MSG_name__', {
      type: 'id',
      value: 'edge:dark-reader'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Dark Reader');
  });

  it('normalizes chrome: prefixed non-chrome-pattern ID', () => {
    const report = buildReport('__MSG_name__', {
      type: 'id',
      value: 'chrome:my-extension-name'
    });

    expect(resolveExtensionDisplayName(report)).toBe('My Extension Name');
  });

  it('falls back to chrome identifier for chrome: prefixed chrome-pattern ID', () => {
    const report = buildReport('__MSG_name__', {
      type: 'id',
      value: 'chrome:abcdefghijklmnopabcdefghijklmnop'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Chrome Extension (abcdefgh...)');
  });

  it('normalizes camelCase filenames from upload', () => {
    const report = buildReport('__MSG_name__', {
      type: 'file',
      filename: 'myAwesomeExtension.crx',
      mimeType: 'application/x-chrome-extension'
    });

    expect(resolveExtensionDisplayName(report)).toBe('My Awesome Extension');
  });

  it('normalizes underscored filenames from upload', () => {
    const report = buildReport('__MSG_name__', {
      type: 'file',
      filename: 'my_cool_extension.zip',
      mimeType: 'application/zip'
    });

    expect(resolveExtensionDisplayName(report)).toBe('My Cool Extension');
  });

  it('normalizes filenames with @ symbols', () => {
    const report = buildReport('__MSG_name__', {
      type: 'file',
      filename: '@scope+my-extension.zip',
      mimeType: 'application/zip'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Scope My Extension');
  });

  it('returns null for filenames that normalize to empty strings', () => {
    const report = buildReport('__MSG_name__', {
      type: 'file',
      filename: '...',
      mimeType: 'application/zip'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Extension name unavailable');
  });

  it('returns null for filenames that are just chrome extension IDs', () => {
    const report = buildReport('__MSG_name__', {
      type: 'file',
      filename: 'abcdefghijklmnopabcdefghijklmnop.zip',
      mimeType: 'application/zip'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Extension name unavailable');
  });

  it('detects unresolved localized names with substring match', () => {
    const report = buildReport('prefix __MSG_name__ suffix', {
      type: 'url',
      value: 'https://example.com/my-ext'
    });

    expect(resolveExtensionDisplayName(report)).toBe('My Ext');
  });

  it('uses manifest name when it is valid and not localized', () => {
    const report = buildReport('  Trimmed Name  ', {
      type: 'url',
      value: 'https://example.com'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Trimmed Name');
  });

  it('falls back to source for empty ID', () => {
    const report = buildReport('', {
      type: 'id',
      value: 'firefox:ublock'
    });

    expect(resolveExtensionDisplayName(report)).toBe('Ublock');
  });
});
