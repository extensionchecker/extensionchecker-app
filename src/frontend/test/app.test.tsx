import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
  // Stub version.txt so useAppVersion doesn't interfere with test fetch mocks.
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
});

function buildReport(source: { type: 'url'; value: string } | { type: 'id'; value: string } | { type: 'file'; filename: string; mimeType: string }) {
  return {
    reportVersion: '1.0.0',
    analyzedAt: '2026-03-11T00:00:00.000Z',
    source,
    metadata: {
      name: 'UI Test Extension',
      version: '1.0.0',
      manifestVersion: 3
    },
    permissions: {
      requestedPermissions: ['cookies'],
      optionalPermissions: [],
      hostPermissions: ['<all_urls>']
    },
    riskSignals: [],
    score: {
      value: 20,
      severity: 'medium',
      rationale: 'Test rationale.'
    },
    summary: 'Summary text.',
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: ['Manifest-first analysis only.']
    }
  };
}

describe('App', () => {
  it('shows the paste tab by default and detects a Firefox URL', async () => {
    const { container } = render(<App />);

    expect(screen.getByRole('tab', { name: 'Paste' })).toHaveAttribute('aria-selected', 'true');

    const input = screen.getByLabelText('Extension URL or ID');
    fireEvent.change(input, { target: { value: 'https://addons.mozilla.org/firefox/addon/ublock-origin/' } });

    expect(screen.getByText('Firefox extension detected')).toBeInTheDocument();
    expect(container.querySelector('.browser-detection-image')).toHaveAttribute('src', '/browser-icons/icon_firefox.png');
  });

  it('treats a bare 32-character Chromium ID as ambiguous instead of Chrome-only', async () => {
    const { container } = render(<App />);

    fireEvent.change(screen.getByLabelText('Extension URL or ID'), { target: { value: 'nffknjpglkklphnibdiadeeeeailfnog' } });

    expect(screen.getByText('Chrome or Edge extension ID detected')).toBeInTheDocument();
    expect(container.querySelector('.browser-detection-image')).toBeNull();
  });

  it('detects Opera URLs as supported', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Extension URL or ID'), { target: { value: 'https://addons.opera.com/en/extensions/details/ublock/' } });

    expect(screen.getByText('Opera extension detected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeEnabled();
  });

  it('shows Safari guidance and disables submit for Safari URLs', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Extension URL or ID'), { target: { value: 'https://apps.apple.com/us/app/1password-password-manager/id1511601750' } });

    expect(screen.getByText('Safari listing detected')).toBeInTheDocument();
    expect(screen.getByText('Safari App Store URLs are not supported. Upload the extension instead.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  });

  it('keeps invalid URLs short and disables submit until they are complete', async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Extension URL or ID'), { target: { value: 'https://' } });

    expect(screen.getByText('Enter a full URL or extension ID.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
  });

  it('switches to the upload tab and enables upload analysis when a file is chosen', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
    expect(screen.getByRole('tab', { name: 'Upload' })).toHaveAttribute('aria-selected', 'true');

    const fileInput = screen.getByLabelText('Extension package file') as HTMLInputElement;
    const file = new File(['dummy'], 'extension.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText(/Ready to analyze/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Upload' })).toBeEnabled();
  });

  it('submits URL and renders report summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify(buildReport({
        type: 'url',
        value: 'https://example.com/extension.zip'
      })), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }));
    });

    render(<App />);

  const input = screen.getByLabelText('Extension URL or ID');
    fireEvent.change(input, { target: { value: 'https://example.com/extension.zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('UI Test Extension')).toBeInTheDocument();
      expect(screen.getByText('Summary text.')).toBeInTheDocument();
    });
  });

  it('submits extension ID request when the generic field detects an ID', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify(buildReport({
        type: 'id',
        value: 'abcdefghijklmnopabcdefghijklmnop'
      })), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      }));
    });

    render(<App />);

  fireEvent.change(screen.getByLabelText('Extension URL or ID'), { target: { value: 'abcdefghijklmnopabcdefghijklmnop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('UI Test Extension')).toBeInTheDocument();
    });

    const fetchInit = fetchSpy.mock.calls.find((c) => String(c[0]) === '/api/analyze')?.[1] as RequestInit;
    expect(fetchSpy.mock.calls.some((c) => String(c[0]) === '/api/analyze')).toBe(true);
    expect(fetchInit.method).toBe('POST');
    expect(typeof fetchInit.body).toBe('string');
    expect(fetchInit.body).toContain('"type":"id"');
  });

  it('shows a readable error for non-json backend failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response('', { status: 502 }));
    });

    render(<App />);

  const input = screen.getByLabelText('Extension URL or ID');
    fireEvent.change(input, { target: { value: 'https://example.com/extension.zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('Backend request failed with status 502.')).toBeInTheDocument();
    });
  });

  it('bubbles backend validation errors for unsupported URLs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (typeof input === 'string' && input.endsWith('/version.txt')) {
        return Promise.resolve(new Response('', { status: 404 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        error: 'Unsupported URL. Only browser extension store URLs are supported, or upload the extension.'
      }), {
        status: 400,
        headers: {
          'content-type': 'application/json'
        }
      }));
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText('Extension URL or ID'), { target: { value: 'https://example.com/extension.zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    await waitFor(() => {
      expect(screen.getByText('Unsupported URL. Only browser extension store URLs are supported, or upload the extension.')).toBeInTheDocument();
    });
  });
});
