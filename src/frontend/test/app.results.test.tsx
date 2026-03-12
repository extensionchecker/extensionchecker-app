import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadReportPdfMock } = vi.hoisted(() => ({
  downloadReportPdfMock: vi.fn(async (_report: unknown) => {})
}));

vi.mock('../src/pdf-report', () => ({
  downloadReportPdf: downloadReportPdfMock
}));

import { App } from '../src/App';

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  downloadReportPdfMock.mockReset();
  globalThis.localStorage.clear();
});

function buildDetailedReport() {
  return {
    reportVersion: '1.0.0',
    analyzedAt: '2026-03-11T00:00:00.000Z',
    source: {
      type: 'url',
      value: 'https://chromewebstore.google.com/detail/sample-extension/abcdefghijklmnopabcdefghijklmnop'
    },
    metadata: {
      name: 'Detailed Coverage Extension',
      version: '2.0.0',
      manifestVersion: 3
    },
    permissions: {
      requestedPermissions: ['cookies', 'tabs'],
      optionalPermissions: ['activeTab'],
      hostPermissions: ['<all_urls>']
    },
    riskSignals: [
      {
        id: 'broad-host-access',
        title: 'Broad host access',
        severity: 'high',
        description: 'Has broad host access.',
        evidence: [{ key: 'host', value: '<all_urls>' }],
        scoreImpact: 35
      },
      {
        id: 'cookies',
        title: 'Sensitive permission: cookies',
        severity: 'medium',
        description: 'Cookies access present.',
        evidence: [{ key: 'permission', value: 'cookies' }],
        scoreImpact: 20
      }
    ],
    score: {
      value: 62,
      severity: 'high',
      rationale: 'test rationale'
    },
    summary: 'Detected multiple risk signals.',
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: ['Manifest-only analysis.', 'No runtime behavior detonation.']
    }
  };
}

describe('App results flows', () => {
  it('uses persisted theme preference from localStorage', () => {
    globalThis.localStorage.setItem('theme', 'light');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Theme: light. Switch to dark.' })).toBeInTheDocument();
  });

  it('renders empty results route and returns to scanner', () => {
    globalThis.history.replaceState(null, '', '/results');
    render(<App />);

    expect(screen.getByText('No Report Loaded')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Scanner' }));
    expect(screen.getByLabelText('Input mode')).toBeInTheDocument();
  });

  it('navigates overview/findings/phases and triggers PDF export', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(buildDetailedReport()), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }));

    render(<App />);

    const urlInput = screen.getByLabelText('Extension package URL');
    fireEvent.change(urlInput, {
      target: {
        value: 'https://chromewebstore.google.com/detail/sample-extension/abcdefghijklmnopabcdefghijklmnop'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('Detailed Coverage Extension')).toBeInTheDocument();
      expect(screen.getByText('Declared Permissions and Access')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Findings/i }));
    expect(screen.getByText('Why This Extension May Be Risky')).toBeInTheDocument();
    expect(screen.getByText('Broad host access')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Phases/i }));
    expect(screen.getByText('Analysis Pipeline Status')).toBeInTheDocument();
    expect(screen.getByText('Current Analysis Limits')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF report' }));
    await waitFor(() => {
      expect(downloadReportPdfMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Back to Scanner/i }));
    expect(screen.getByLabelText('Input mode')).toBeInTheDocument();
  });

  it('shows empty findings and permissions states for sparse reports', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      reportVersion: '1.0.0',
      analyzedAt: '2026-03-11T00:00:00.000Z',
      source: {
        type: 'file',
        filename: 'manual-upload.zip',
        mimeType: 'application/zip'
      },
      metadata: {
        name: 'Sparse Report Extension',
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
        value: 5,
        severity: 'low',
        rationale: 'test rationale'
      },
      summary: 'No significant findings.',
      limits: {
        codeExecutionAnalysisPerformed: false,
        notes: ['Manifest only.']
      }
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }));

    render(<App />);

    fireEvent.change(screen.getByLabelText('Extension package URL'), {
      target: {
        value: 'https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/addon-latest.xpi'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('Sparse Report Extension')).toBeInTheDocument();
      expect(screen.getByText('No declared permissions or host scopes were found.')).toBeInTheDocument();
      expect(screen.getAllByText('Uploaded package').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByRole('tab', { name: /Findings/i }));
    expect(screen.getByText('No specific high-impact risk signals were detected from manifest declarations.')).toBeInTheDocument();
  });
});
