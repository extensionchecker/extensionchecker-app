import { describe, expect, it } from 'vitest';
import { AnalysisProgressEventSchema, AnalysisReportSchema } from '../src/report-schema';

describe('AnalysisReportSchema', () => {
  it('accepts a valid analysis report', () => {
    const result = AnalysisReportSchema.safeParse({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: {
        type: 'url',
        value: 'https://example.com/extension.zip'
      },
      metadata: {
        name: 'Example Extension',
        version: '1.2.3',
        manifestVersion: 3
      },
      permissions: {
        requestedPermissions: ['storage'],
        optionalPermissions: ['cookies'],
        hostPermissions: ['https://*/*']
      },
      riskSignals: [
        {
          id: 'broad-host-access',
          title: 'Broad host access',
          severity: 'high',
          description: 'Extension can run on many sites.',
          evidence: [
            {
              key: 'host_permission',
              value: 'https://*/*'
            }
          ],
          scoreImpact: 35
        }
      ],
      score: {
        value: 35,
        severity: 'high',
        rationale: 'Risk is driven by broad host access.'
      },
      summary: 'High host access scope.',
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: ['Manifest-first analysis only.']
      }
    });

    expect(result.success).toBe(true);
  });

  it('accepts a report with optional storeMetadata', () => {
    const result = AnalysisReportSchema.safeParse({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: {
        type: 'url',
        value: 'https://example.com/extension.zip'
      },
      metadata: {
        name: 'Example Extension',
        version: '1.2.3',
        manifestVersion: 3
      },
      permissions: {
        requestedPermissions: ['storage'],
        optionalPermissions: [],
        hostPermissions: []
      },
      riskSignals: [],
      score: {
        value: 0,
        severity: 'low',
        rationale: 'No risk signals.'
      },
      summary: 'Clean extension.',
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: ['Manifest-first analysis only.']
      },
      storeMetadata: {
        description: 'A helpful extension',
        author: 'Test Author',
        developerName: 'Dev Corp',
        developerUrl: 'https://dev.example.com',
        homepageUrl: 'https://example.com',
        packageSizeBytes: 102400,
        storeUrl: 'https://chromewebstore.google.com/detail/abc',
        category: 'Productivity',
        rating: 4.5,
        ratingCount: 100,
        userCount: 50000,
        lastUpdated: '2026-01-15',
        privacyPolicyUrl: 'https://example.com/privacy',
        supportUrl: 'https://example.com/support'
      }
    });

    expect(result.success).toBe(true);
  });

  it('accepts a report without storeMetadata (backward compatible)', () => {
    const result = AnalysisReportSchema.safeParse({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: {
        type: 'id',
        value: 'chrome:abcdefghijklmnopabcdefghijklmnop'
      },
      metadata: {
        name: 'Minimal Extension',
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
        rationale: 'No risk.'
      },
      summary: 'Clean.',
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: []
      }
    });

    expect(result.success).toBe(true);
  });

  it('validates AnalysisProgressEvent schema', () => {
    const valid = AnalysisProgressEventSchema.safeParse({
      step: 'downloading',
      message: 'Downloading package…',
      percent: 40
    });
    expect(valid.success).toBe(true);

    const invalidStep = AnalysisProgressEventSchema.safeParse({
      step: 'unknown',
      message: 'test',
      percent: 50
    });
    expect(invalidStep.success).toBe(false);

    const outOfRange = AnalysisProgressEventSchema.safeParse({
      step: 'analyzing',
      message: 'test',
      percent: 150
    });
    expect(outOfRange.success).toBe(false);
  });

  it('rejects reports with out-of-range score values', () => {
    const result = AnalysisReportSchema.safeParse({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: {
        type: 'url',
        value: 'https://example.com/extension.zip'
      },
      metadata: {
        name: 'Example Extension',
        version: '1.2.3',
        manifestVersion: 3
      },
      permissions: {
        requestedPermissions: [],
        optionalPermissions: [],
        hostPermissions: []
      },
      riskSignals: [],
      score: {
        value: 999,
        severity: 'critical',
        rationale: 'Invalid score.'
      },
      summary: 'Invalid.',
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: ['Manifest-first analysis only.']
      }
    });

    expect(result.success).toBe(false);
  });

  it('accepts a composite report with scoringBasis, permissionsScore, and storeTrustScore', () => {
    const result = AnalysisReportSchema.safeParse({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: {
        type: 'id',
        value: 'firefox:ublock-origin'
      },
      metadata: {
        name: 'uBlock Origin',
        version: '1.60.0',
        manifestVersion: 2
      },
      permissions: {
        requestedPermissions: ['webRequest', 'tabs'],
        optionalPermissions: [],
        hostPermissions: ['<all_urls>']
      },
      riskSignals: [],
      score: {
        value: 34,
        severity: 'medium',
        rationale: 'Composite from manifest and store signals.'
      },
      permissionsScore: 88,
      storeTrustScore: 95,
      scoringBasis: 'manifest-and-store',
      summary: 'Composite score, store trust applied.',
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: ['Manifest-first analysis.']
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scoringBasis).toBe('manifest-and-store');
      expect(result.data.permissionsScore).toBe(88);
      expect(result.data.storeTrustScore).toBe(95);
    }
  });

  it('rejects an invalid scoringBasis value', () => {
    const result = AnalysisReportSchema.safeParse({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: { type: 'url', value: 'https://example.com/ext.zip' },
      metadata: { name: 'Ext', version: '1.0', manifestVersion: 3 },
      permissions: { requestedPermissions: [], optionalPermissions: [], hostPermissions: [] },
      riskSignals: [],
      score: { value: 10, severity: 'low', rationale: 'low' },
      scoringBasis: 'unknown-basis',
      summary: 'test',
      limits: { codeExecutionAnalysisPerformed: false, notes: [] }
    });

    expect(result.success).toBe(false);
  });
});
