import { describe, expect, it } from 'vitest';
import { AnalysisReportSchema } from '../src/report-schema';

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
});
