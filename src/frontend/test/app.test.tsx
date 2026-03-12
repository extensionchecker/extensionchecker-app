import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function buildReport(source: { type: 'url'; value: string } | { type: 'id'; value: string }) {
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
  it('submits URL and renders report summary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(buildReport({
      type: 'url',
      value: 'https://example.com/extension.zip'
    })), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }));

    render(<App />);

    const input = screen.getByLabelText('Extension package URL');
    fireEvent.change(input, { target: { value: 'https://example.com/extension.zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze URL' }));

    await waitFor(() => {
      expect(screen.getByText('UI Test Extension')).toBeInTheDocument();
      expect(screen.getByText('Summary text.')).toBeInTheDocument();
    });
  });

  it('submits extension ID mode request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(buildReport({
      type: 'id',
      value: 'abcdefghijklmnopabcdefghijklmnop'
    })), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }));

    render(<App />);

    fireEvent.change(screen.getByLabelText('Input mode'), { target: { value: 'id' } });
    fireEvent.change(screen.getByLabelText('Extension ID'), { target: { value: 'abcdefghijklmnopabcdefghijklmnop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze ID' }));

    await waitFor(() => {
      expect(screen.getByText('UI Test Extension')).toBeInTheDocument();
    });

    const fetchInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('/api/analyze');
    expect(fetchInit.method).toBe('POST');
    expect(typeof fetchInit.body).toBe('string');
    expect(fetchInit.body).toContain('"type":"id"');
  });

  it('shows a readable error for non-json backend failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', {
      status: 502
    }));

    render(<App />);

    const input = screen.getByLabelText('Extension package URL');
    fireEvent.change(input, { target: { value: 'https://example.com/extension.zip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze URL' }));

    await waitFor(() => {
      expect(screen.getByText('Backend request failed with status 502.')).toBeInTheDocument();
    });
  });
});
