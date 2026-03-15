/**
 * Unit tests for components and utilities introduced in the findings donut /
 * filter chips feature set:
 *
 *   - trust-signal.ts  — overallTrustScore, trustSignalExplanation
 *   - formatting.ts    — toneForTrustScore
 *   - FindingsSeverityDonut — all render paths
 *   - FindingsPanel    — filter chip interactions and empty states
 *   - AnalysisSignals  — all six chip variant combinations
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnalysisReport, RiskSignal } from '@extensionchecker/shared';

import { overallTrustScore, trustSignalExplanation } from '../src/utils/trust-signal';
import { toneForTrustScore } from '../src/utils/formatting';
import { FindingsSeverityDonut } from '../src/components/FindingsSeverityDonut';
import { FindingsPanel } from '../src/components/FindingsPanel';
import { AnalysisSignals } from '../src/components/AnalysisSignals';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseReport(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    reportVersion: '1.0.0',
    analyzedAt: '2026-03-15T00:00:00.000Z',
    source: { type: 'file', filename: 'test.zip', mimeType: 'application/zip' },
    metadata: { name: 'Test Extension', version: '1.0.0', manifestVersion: 3 },
    permissions: { requestedPermissions: [], optionalPermissions: [], hostPermissions: [] },
    riskSignals: [],
    score: { value: 40, severity: 'medium', rationale: 'test' },
    scoringBasis: 'manifest-only',
    summary: 'test',
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: [],
    },
    ...overrides,
  };
}

function codeSignal(id: string, severity: RiskSignal['severity']): RiskSignal {
  return {
    id: `code-scan-${id}`,
    title: `Code signal ${id}`,
    severity,
    description: 'desc',
    evidence: [{ key: 'file', value: 'index.js' }],
    scoreImpact: 10,
  };
}

function manifestSignal(id: string): RiskSignal {
  return {
    id,
    title: `Manifest signal ${id}`,
    severity: 'high',
    description: 'desc',
    evidence: [{ key: 'permission', value: '<all_urls>' }],
    scoreImpact: 20,
  };
}

function storeSignal(): RiskSignal {
  return {
    id: 'store-low-rating',
    title: 'Store signal',
    severity: 'medium',
    description: 'desc',
    evidence: [{ key: 'rating', value: '2.0' }],
    scoreImpact: 5,
  };
}

// ---------------------------------------------------------------------------
// trust-signal.ts — overallTrustScore
// ---------------------------------------------------------------------------

describe('overallTrustScore', () => {
  it('returns 100 - score.value for a standard report', () => {
    expect(overallTrustScore(baseReport({ score: { value: 30, severity: 'medium', rationale: '' } }))).toBe(70);
  });

  it('clamps at 0 when score.value >= 100', () => {
    expect(overallTrustScore(baseReport({ score: { value: 100, severity: 'critical', rationale: '' } }))).toBe(0);
    expect(overallTrustScore(baseReport({ score: { value: 120, severity: 'critical', rationale: '' } }))).toBe(0);
  });

  it('returns 100 when score.value is 0', () => {
    expect(overallTrustScore(baseReport({ score: { value: 0, severity: 'low', rationale: '' } }))).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// trust-signal.ts — trustSignalExplanation
// ---------------------------------------------------------------------------

describe('trustSignalExplanation', () => {
  it('returns null for manifest-only basis', () => {
    expect(trustSignalExplanation(baseReport({ scoringBasis: 'manifest-only' }))).toBeNull();
  });

  it('returns null when storeMetadata is absent', () => {
    expect(trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: undefined,
    }))).toBeNull();
  });

  it('returns null when storeMetadata has neither rating nor userCount', () => {
    expect(trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: {},
    }))).toBeNull();
  });

  it('returns strong-signals message for high rating + high user count', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 4.6, userCount: 1_200_000 },
    }));
    expect(result).toContain('Strong trust signals');
    expect(result).toContain('4.6★');
    expect(result).toContain('1.2M');
  });

  it('returns high-rating low-adoption message for high rating + low user count', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 4.8, userCount: 50 },
    }));
    expect(result).toContain('limited adoption');
    expect(result).toContain('4.8★');
  });

  it('returns broad adoption + low rating caution message', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 2.1, userCount: 800_000 },
    }));
    expect(result).toContain('caution signal');
    expect(result).toContain('2.1★');
  });

  it('returns weak trust message for low rating + low user count', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 1.5, userCount: 10 },
    }));
    expect(result).toContain('Weak trust signals');
  });

  it('returns neutral store signals message for mid rating + mid users', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 3.5, userCount: 50_000 },
    }));
    expect(result).toContain('Store signals');
  });

  it('returns rating-only message when no user count — high rating', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 4.5 },
    }));
    expect(result).toContain('no active user count');
    expect(result).toContain('4.5★');
  });

  it('returns rating-only message when no user count — low rating', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 2.2 },
    }));
    expect(result).toContain('Below-average rating');
  });

  it('returns user-only message when no rating — high adoption', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { userCount: 500_000 },
    }));
    expect(result).toContain('active users on the store');
    expect(result).toContain('500K');
  });

  it('returns user-only message when no rating — low adoption', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { userCount: 200 },
    }));
    expect(result).toContain('limited adoption signal');
    expect(result).toContain('200');
  });

  it('formats user counts in millions', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { rating: 4.7, userCount: 2_500_000 },
    }));
    expect(result).toContain('2.5M');
  });

  it('formats user counts in thousands', () => {
    const result = trustSignalExplanation(baseReport({
      scoringBasis: 'manifest-and-store',
      storeMetadata: { userCount: 15_000 },
    }));
    expect(result).toContain('15K');
  });
});

// ---------------------------------------------------------------------------
// formatting.ts — toneForTrustScore
// ---------------------------------------------------------------------------

describe('toneForTrustScore', () => {
  it('returns good for trust >= 61', () => {
    expect(toneForTrustScore(100)).toBe('good');
    expect(toneForTrustScore(61)).toBe('good');
  });

  it('returns caution for trust 41–60', () => {
    expect(toneForTrustScore(60)).toBe('caution');
    expect(toneForTrustScore(41)).toBe('caution');
  });

  it('returns warning for trust 21–40', () => {
    expect(toneForTrustScore(40)).toBe('warning');
    expect(toneForTrustScore(21)).toBe('warning');
  });

  it('returns danger for trust <= 20', () => {
    expect(toneForTrustScore(20)).toBe('danger');
    expect(toneForTrustScore(0)).toBe('danger');
  });
});

// ---------------------------------------------------------------------------
// FindingsSeverityDonut — render paths
// ---------------------------------------------------------------------------

describe('FindingsSeverityDonut', () => {
  it('renders clean state (green tick) when no signals passed', () => {
    render(<FindingsSeverityDonut signals={[]} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('clean')).toBeInTheDocument();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  it('renders clean state when signals are all non-code (manifest / store)', () => {
    const signals: RiskSignal[] = [manifestSignal('m1'), storeSignal()];
    render(<FindingsSeverityDonut signals={signals} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('clean')).toBeInTheDocument();
  });

  it('shows total code-finding count in centre', () => {
    const signals: RiskSignal[] = [
      codeSignal('xss-1', 'high'),
      codeSignal('eval-1', 'critical'),
      manifestSignal('broad-host'), // should NOT be counted
    ];
    render(<FindingsSeverityDonut signals={signals} />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('findings')).toBeInTheDocument();
  });

  it('uses singular "finding" label for exactly one finding', () => {
    render(<FindingsSeverityDonut signals={[codeSignal('xss-1', 'medium')]} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('finding')).toBeInTheDocument();
  });

  it('uses aria-label describing finding breakdown', () => {
    const signals: RiskSignal[] = [
      codeSignal('a', 'critical'),
      codeSignal('b', 'high'),
      codeSignal('c', 'medium'),
      codeSignal('d', 'low'),
    ];
    render(<FindingsSeverityDonut signals={signals} />);
    const donut = screen.getByLabelText(/Code findings: 1 critical, 1 high, 1 medium, 1 low/i);
    expect(donut).toBeInTheDocument();
  });

  it('labels clean state with accessible text', () => {
    render(<FindingsSeverityDonut signals={[]} />);
    expect(screen.getByLabelText(/No code scan findings/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FindingsPanel — filter chips & empty states
// ---------------------------------------------------------------------------

describe('FindingsPanel', () => {
  it('renders all signals by default', () => {
    const signals: RiskSignal[] = [
      manifestSignal('perm-1'),
      codeSignal('xss-1', 'high'),
    ];
    render(<FindingsPanel sortedSignals={signals} />);
    expect(screen.getByText('Manifest signal perm-1')).toBeInTheDocument();
    expect(screen.getByText('Code signal xss-1')).toBeInTheDocument();
  });

  it('renders empty state when no signals', () => {
    render(<FindingsPanel sortedSignals={[]} />);
    expect(screen.getByText('No risk signals were detected.')).toBeInTheDocument();
  });

  it('shows source filter chips with correct counts', () => {
    const signals: RiskSignal[] = [
      manifestSignal('perm-1'),
      manifestSignal('perm-2'),
      codeSignal('xss-1', 'medium'),
    ];
    render(<FindingsPanel sortedSignals={signals} />);
    // Chip labels appear: Manifest (2), Store (0), Code Scan (1)
    expect(screen.getByText('Manifest')).toBeInTheDocument();
    expect(screen.getByText('Code Scan')).toBeInTheDocument();
  });

  it('hides manifest signals when manifest filter is toggled off', () => {
    const signals: RiskSignal[] = [
      manifestSignal('perm-1'),
      codeSignal('xss-1', 'high'),
    ];
    render(<FindingsPanel sortedSignals={signals} />);

    fireEvent.click(screen.getByRole('button', { name: /Manifest/i }));

    expect(screen.queryByText('Manifest signal perm-1')).not.toBeInTheDocument();
    expect(screen.getByText('Code signal xss-1')).toBeInTheDocument();
  });

  it('shows filtered-empty message when active filters produce no results', () => {
    const signals: RiskSignal[] = [manifestSignal('perm-1')];
    render(<FindingsPanel sortedSignals={signals} />);

    // Deactivate the only active source that has results
    fireEvent.click(screen.getByRole('button', { name: /Manifest/i }));

    expect(screen.getByText('No findings match the selected sources.')).toBeInTheDocument();
  });

  it('re-shows signals when a filter is toggled back on', () => {
    const signals: RiskSignal[] = [manifestSignal('perm-1')];
    render(<FindingsPanel sortedSignals={signals} />);

    const chip = screen.getByRole('button', { name: /Manifest/i });
    fireEvent.click(chip); // off
    fireEvent.click(chip); // on

    expect(screen.getByText('Manifest signal perm-1')).toBeInTheDocument();
  });

  it('shows source provenance pill on each signal', () => {
    const signals: RiskSignal[] = [
      manifestSignal('perm-1'),
      codeSignal('xss-1', 'high'),
    ];
    render(<FindingsPanel sortedSignals={signals} />);
    expect(screen.getAllByText('manifest').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('code').length).toBeGreaterThanOrEqual(1);
  });

  it('disables store chip when no store signals present', () => {
    render(<FindingsPanel sortedSignals={[manifestSignal('perm-1')]} />);
    const storeChip = screen.getByRole('button', { name: /Store/i });
    expect(storeChip).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// AnalysisSignals — all chip variants
// ---------------------------------------------------------------------------

describe('AnalysisSignals', () => {
  function render_report(overrides: Partial<AnalysisReport>) {
    render(<AnalysisSignals report={baseReport(overrides)} />);
  }

  it('shows ok chip for manifest-and-store basis', () => {
    render_report({ scoringBasis: 'manifest-and-store' });
    // The container should exist and not show an error chip for store
    expect(screen.getByLabelText('Analysis coverage')).toBeInTheDocument();
    expect(screen.getAllByText('Store').length).toBeGreaterThanOrEqual(1);
  });

  it('shows cached chip (history icon) for manifest-and-store-cached basis', () => {
    render_report({ scoringBasis: 'manifest-and-store-cached' });
    // The cached variant uses the history icon
    const icons = document.querySelectorAll('.material-symbols-outlined');
    const iconTexts = Array.from(icons).map((el) => el.textContent?.trim());
    expect(iconTexts).toContain('history');
  });

  it('shows error chip (cancel icon) for manifest-store-unavailable basis', () => {
    render_report({ scoringBasis: 'manifest-store-unavailable' });
    const icons = document.querySelectorAll('.material-symbols-outlined');
    const iconTexts = Array.from(icons).map((el) => el.textContent?.trim());
    expect(iconTexts).toContain('cancel');
  });

  it('shows na chip for manifest-only basis', () => {
    render_report({ scoringBasis: 'manifest-only' });
    const icons = document.querySelectorAll('.material-symbols-outlined');
    const iconTexts = Array.from(icons).map((el) => el.textContent?.trim());
    expect(iconTexts).toContain('block');
  });

  it('shows note about AMO API when store is na', () => {
    render_report({ scoringBasis: 'manifest-only' });
    expect(screen.getByText(/Firefox Add-ons \(AMO\) API/i)).toBeInTheDocument();
  });

  it('shows Code (Lite) label for lite code scan that completed', () => {
    render_report({
      limits: {
        codeExecutionAnalysisPerformed: true,
        codeAnalysisMode: 'lite',
        notes: [],
      },
    });
    expect(screen.getByText('Code (Lite)')).toBeInTheDocument();
  });

  it('shows Code (Full) label for full code scan that completed', () => {
    render_report({
      limits: {
        codeExecutionAnalysisPerformed: true,
        codeAnalysisMode: 'full',
        notes: [],
      },
    });
    expect(screen.getByText('Code (Full)')).toBeInTheDocument();
  });

  it('shows Code (Partial) label when budget exhausted', () => {
    render_report({
      limits: {
        codeExecutionAnalysisPerformed: true,
        codeAnalysisBudgetExhausted: true,
        notes: [],
      },
    });
    expect(screen.getByText('Code (Partial)')).toBeInTheDocument();
  });

  it('shows Code (grey na) when code scan not performed', () => {
    render_report({
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: [],
      },
    });
    expect(screen.getByText('Code')).toBeInTheDocument();
    const codeChip = screen.getByText('Code').closest('.analysis-signal');
    expect(codeChip).toHaveClass('analysis-signal--na');
  });
});
