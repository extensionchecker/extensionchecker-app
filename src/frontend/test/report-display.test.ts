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
});
