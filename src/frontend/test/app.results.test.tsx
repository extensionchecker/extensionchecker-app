import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadReportPdfMock } = vi.hoisted(() => ({
  downloadReportPdfMock: vi.fn(async (_report: unknown) => {})
}));

vi.mock('../src/pdf-report', () => ({
  downloadReportPdf: downloadReportPdfMock
}));

import { App } from '../src/App';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (typeof input === 'string' && input.endsWith('/version.txt')) {
      return Promise.resolve(new Response('', { status: 404 }));
    }

    return originalFetch(input, init);
  });
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
    expect(screen.getByLabelText('Extension URL or ID')).toBeInTheDocument();
  });

  it('ignores an extensionId query param that exceeds the maximum allowed length', () => {
    const oversizedId = 'x'.repeat(2049);
    globalThis.history.replaceState(null, '', `/results?extensionId=${oversizedId}`);
    render(<App />);

    // Value exceeds MAX_QUERY_PARAM_VALUE_LENGTH so both the auto-submit guard and the
    // rescanValue memo reject it - the generic "No Report Loaded" state must be shown
    expect(screen.getByText('No Report Loaded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan Extension' })).not.toBeInTheDocument();
  });

  it('ignores an extensionUrl query param that exceeds the maximum allowed length', () => {
    const oversizedUrl = `https://chromewebstore.google.com/detail/${'a'.repeat(2049)}`;
    globalThis.history.replaceState(null, '', `/results?extensionUrl=${encodeURIComponent(oversizedUrl)}`);
    render(<App />);

    expect(screen.getByText('No Report Loaded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan Extension' })).not.toBeInTheDocument();
  });

  it('auto-submits analysis when landing on results route with extensionId query param', async () => {
    globalThis.history.replaceState(null, '', '/results?extensionId=chrome%3Aabcdefghijklmnopabcdefghijklmnop');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify(buildDetailedReport()), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Coverage Extension')).toBeInTheDocument();
    });
  });

  it('auto-submits analysis when landing on results route with extensionUrl query param', async () => {
    const storeUrl = 'https://chromewebstore.google.com/detail/sample-extension/abcdefghijklmnopabcdefghijklmnop';
    globalThis.history.replaceState(null, '', `/results?extensionUrl=${encodeURIComponent(storeUrl)}`);
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify(buildDetailedReport()), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Coverage Extension')).toBeInTheDocument();
    });
  });

  it('auto-submit pre-fills the text input with the extension identifier', async () => {
    globalThis.history.replaceState(null, '', '/results?extensionId=chrome%3Aabcdefghijklmnopabcdefghijklmnop');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }));
    });

    render(<App />);

    // Auto-submit fires and navigates to scan page; the pre-filled value should appear in the input
    await waitFor(() => {
      const input = screen.getByLabelText('Extension URL or ID') as HTMLInputElement;
      expect(input.value).toBe('chrome:abcdefghijklmnopabcdefghijklmnop');
    });
  });

  it('shows Re-scan Extension button when navigating back to results with no report after a failed auto-submit', async () => {
    globalThis.history.replaceState(null, '', '/results?extensionId=chrome%3Aabcdefghijklmnopabcdefghijklmnop');
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' }
      }));
    });

    render(<App />);

    // Auto-submit fires, fails, leaving the user on the scan page with an error
    await waitFor(() => {
      expect(screen.getByLabelText('Extension URL or ID')).toBeInTheDocument();
    });

    // Simulate user navigating back to /results manually (e.g. browser back button)
    globalThis.history.replaceState(null, '', '/results?extensionId=chrome%3Aabcdefghijklmnopabcdefghijklmnop');
    fireEvent.popState(window);

    // Re-scan button should appear since the URL still has the extensionId but no report is in memory
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Re-scan Extension' })).toBeInTheDocument();
    });

    // Clicking Re-scan navigates to scanner and pre-fills the input
    fireEvent.click(screen.getByRole('button', { name: 'Re-scan Extension' }));
    const input = screen.getByLabelText('Extension URL or ID') as HTMLInputElement;
    expect(input.value).toBe('chrome:abcdefghijklmnopabcdefghijklmnop');
  });

  it('navigates overview/findings/phases and triggers PDF export', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify(buildDetailedReport()), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }));
    });

    render(<App />);

    const urlInput = screen.getByLabelText('Extension URL or ID');
    fireEvent.change(urlInput, {
      target: {
        value: 'https://chromewebstore.google.com/detail/sample-extension/abcdefghijklmnopabcdefghijklmnop'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('Detailed Coverage Extension')).toBeInTheDocument();
      expect(screen.getByText('Declared Permissions and Access')).toBeInTheDocument();
      expect(document.querySelector('.extension-identity-store-image')).toHaveAttribute('src', '/browser-icons/icon_chrome.png');
    });

    fireEvent.click(screen.getByRole('tab', { name: /Findings/i }));
    expect(screen.getByText('Risk Signals')).toBeInTheDocument();
    expect(screen.getByText('Broad host access')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Phases/i }));
    expect(screen.getByText('Analysis Pipeline Status')).toBeInTheDocument();
    expect(screen.getByText('Current Analysis Limits')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF report' }));
    await waitFor(() => {
      expect(downloadReportPdfMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /Back to Scanner/i }));
    expect(screen.getByLabelText('Extension URL or ID')).toBeInTheDocument();
  });

  it('shows empty findings and permissions states for sparse reports', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
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
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
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
    expect(screen.getByText('No risk signals were detected.')).toBeInTheDocument();
  });
});
