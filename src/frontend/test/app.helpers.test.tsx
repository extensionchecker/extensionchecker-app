/**
 * Tests for App.tsx helper functions and rendering paths not covered by
 * the main app.test.tsx and app.results.test.tsx suites.
 *
 * Since all helpers are module-private, they are exercised through
 * component rendering with carefully chosen inputs.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/pdf-report', () => ({
  downloadReportPdf: vi.fn(async () => {})
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
  globalThis.localStorage.clear();
});

function buildReport(overrides: Record<string, unknown> = {}) {
  return {
    reportVersion: '1.0.0',
    analyzedAt: '2026-03-11T00:00:00.000Z',
    source: {
      type: 'url',
      value: 'https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop'
    },
    metadata: {
      name: 'Helper Test Extension',
      version: '1.0.0',
      manifestVersion: 3
    },
    permissions: {
      requestedPermissions: ['cookies', 'tabs', 'storage'],
      optionalPermissions: ['activeTab'],
      hostPermissions: ['<all_urls>']
    },
    riskSignals: [
      {
        id: 'broad-host',
        title: 'Broad host access',
        severity: 'high',
        description: 'Has broad host access.',
        evidence: [{ key: 'host', value: '<all_urls>' }],
        scoreImpact: 35
      },
      {
        id: 'medium-signal',
        title: 'Cookies access',
        severity: 'medium',
        description: 'Can access cookies.',
        evidence: [{ key: 'permission', value: 'cookies' }],
        scoreImpact: 15
      },
      {
        id: 'low-signal',
        title: 'Storage access',
        severity: 'low',
        description: 'Can store data.',
        evidence: [{ key: 'permission', value: 'storage' }],
        scoreImpact: 5
      }
    ],
    score: {
      value: 45,
      severity: 'medium',
      rationale: 'test rationale'
    },
    summary: 'Multiple signals detected.',
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: ['Manifest-only analysis.']
    },
    ...overrides
  };
}

function mockFetchWithReport(report: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    if (typeof input === 'string' && input.endsWith('/version.txt')) {
      return Promise.resolve(new Response('', { status: 404 }));
    }

    return Promise.resolve(new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
  });
}

async function submitUrlAndWaitForReport(url: string) {
  render(<App />);
  const input = screen.getByLabelText('Extension URL or ID');
  fireEvent.change(input, { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
  await waitFor(() => {
    expect(screen.queryByText('Helper Test Extension')).toBeInTheDocument();
  });
}

describe('App helper function coverage', () => {
  describe('score bands and verdict labels via rendered output', () => {
    it('renders High trust band for score <= 20', async () => {
      mockFetchWithReport(buildReport({
        score: { value: 15, severity: 'low', rationale: 'test' },
        riskSignals: []
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('High Trust')).toBeInTheDocument();
    });

    it('renders Med / High trust band for score <= 40', async () => {
      mockFetchWithReport(buildReport({
        score: { value: 35, severity: 'low', rationale: 'test' }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');
      expect(screen.getByText('Med / High')).toBeInTheDocument();
      expect(screen.getByText('Strong Trust')).toBeInTheDocument();
    });

    it('renders Medium trust band for score <= 60', async () => {
      mockFetchWithReport(buildReport({
        score: { value: 55, severity: 'medium', rationale: 'test' }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Moderate Trust')).toBeInTheDocument();
    });

    it('renders Low / Med trust band for score <= 80', async () => {
      mockFetchWithReport(buildReport({
        score: { value: 75, severity: 'high', rationale: 'test' }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');
      expect(screen.getByText('Low / Med')).toBeInTheDocument();
      expect(screen.getByText('Limited Trust')).toBeInTheDocument();
    });

    it('renders Low trust band for score > 80 and critical severity', async () => {
      mockFetchWithReport(buildReport({
        score: { value: 90, severity: 'critical', rationale: 'test' }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('Low Trust')).toBeInTheDocument();
    });
  });

  describe('explainSignalImpact for all severity levels', () => {
    it('shows low-severity impact text in findings tab', async () => {
      mockFetchWithReport(buildReport());
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');
      fireEvent.click(screen.getByRole('tab', { name: /Findings/i }));
      expect(screen.getByText('Lower-impact capability, but still relevant to the overall access footprint.')).toBeInTheDocument();
      expect(screen.getByText(/Meaningful capability that may affect privacy/)).toBeInTheDocument();
      expect(screen.getByText(/High-impact capability/)).toBeInTheDocument();
    });
  });

  describe('metadata tab rendering', () => {
    it('renders metadata tab with store metadata', async () => {
      mockFetchWithReport(buildReport({
        storeMetadata: {
          shortName: 'HTE',
          packageSizeBytes: 1536000,
          author: 'Test Author',
          developerName: 'Test Developer',
          developerUrl: 'https://developer.example.com',
          homepageUrl: 'https://homepage.example.com',
          storeUrl: 'https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop',
          category: 'Productivity',
          rating: 4.5,
          ratingCount: 1234,
          userCount: 500000,
          lastUpdated: '2026-03-01',
          description: 'A test extension for metadata coverage.',
          privacyPolicyUrl: 'https://example.com/privacy',
          supportUrl: 'https://example.com/support'
        }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');

      fireEvent.click(screen.getByRole('tab', { name: /Meta/i }));

      expect(screen.getByText('Extension Metadata')).toBeInTheDocument();
      expect(screen.getByText('HTE')).toBeInTheDocument();
      expect(screen.getByText('1.5 MB')).toBeInTheDocument();
      expect(screen.getByText('Test Author')).toBeInTheDocument();
      expect(screen.getByText('Test Developer')).toBeInTheDocument();
      expect(screen.getByText('Productivity')).toBeInTheDocument();
      expect(screen.getByText('4.5 / 5 (1,234 ratings)')).toBeInTheDocument();
      expect(screen.getByText('500,000')).toBeInTheDocument();
      expect(screen.getByText('2026-03-01')).toBeInTheDocument();
      expect(screen.getByText('A test extension for metadata coverage.')).toBeInTheDocument();
    });

    it('renders metadata tab without store metadata (developer fallback)', async () => {
      mockFetchWithReport(buildReport());
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');

      fireEvent.click(screen.getByRole('tab', { name: /Meta/i }));
      expect(screen.getByText('Extension Metadata')).toBeInTheDocument();
      expect(screen.getByText('No developer information available in the manifest.')).toBeInTheDocument();
    });
  });

  describe('smart submission detection edge cases', () => {
    it('detects Edge store URLs', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'https://microsoftedge.microsoft.com/addons/detail/some-extension/abcdefghijklmnopabcdefghijklmnop' }
      });
      expect(screen.getByText('Edge extension detected')).toBeInTheDocument();
    });

    it('detects chrome: prefixed IDs', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'chrome:abcdefghijklmnopabcdefghijklmnop' }
      });
      expect(screen.getByText('Chrome extension detected')).toBeInTheDocument();
    });

    it('detects firefox: prefixed IDs', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'firefox:ublock-origin' }
      });
      expect(screen.getByText('Firefox extension detected')).toBeInTheDocument();
    });

    it('detects edge: prefixed IDs', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'edge:abcdefghijklmnopabcdefghijklmnop' }
      });
      expect(screen.getByText('Edge extension detected')).toBeInTheDocument();
    });

    it('detects opera: prefixed IDs', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'opera:some-extension' }
      });
      expect(screen.getByText('Opera extension detected')).toBeInTheDocument();
    });

    it('detects safari: prefixed IDs and disables submit', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'safari:some-extension' }
      });
      expect(screen.getByText('Safari extension detected')).toBeInTheDocument();
      expect(screen.getByText('Safari extensions are not supported by ID. Upload the extension instead.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
    });

    it('detects Safari App Store ID format', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'id1511601750' }
      });
      expect(screen.getByText('Safari extension detected')).toBeInTheDocument();
    });

    it('shows helper for HTTP (non-HTTPS) URLs', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'http://chromewebstore.google.com/detail/ext/abcdefghijklmnopabcdefghijklmnop' }
      });
      expect(screen.getByText('Use an https URL.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
    });

    it('handles a generic non-store URL as a generic extension URL', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'https://some-random-site.com/extension.crx' }
      });
      expect(screen.getByText('Extension URL detected')).toBeInTheDocument();
    });

    it('handles a generic non-recognized ID gracefully', () => {
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'some-unknown-id-format' }
      });
      expect(screen.getByText('Extension ID detected')).toBeInTheDocument();
    });
  });

  describe('source store label and listing URL rendering', () => {
    it('renders Firefox store label and listing link for Firefox ID source', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'firefox:ublock-origin' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'firefox:ublock-origin' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Firefox Add-ons').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders Edge store label for edge: prefixed ID source', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'edge:abcdefghijklmnopabcdefghijklmnop' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'edge:abcdefghijklmnopabcdefghijklmnop' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Edge Add-ons').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders Opera store label for opera: prefixed ID source', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'opera:some-ext' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'opera:some-ext' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Opera Add-ons').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders Safari store label for safari URL source', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'url', value: 'https://apps.apple.com/us/app/ext/id123456' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'https://example.com/safari-ext.zip' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Safari Extensions').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders chromium label for bare Chrome ID source', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'abcdefghijklmnopabcdefghijklmnop' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'abcdefghijklmnopabcdefghijklmnop' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Chrome or Edge Extension').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders generic ID label for unrecognized source ID', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'totally-unknown' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'totally-unknown' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Extension ID').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders Edge store label for Edge URL source', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'url', value: 'https://microsoftedge.microsoft.com/addons/detail/ext/abcdefghijklmnopabcdefghijklmnop' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'https://microsoftedge.microsoft.com/addons/detail/ext/abcdefghijklmnopabcdefghijklmnop' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
        expect(screen.getAllByText('Edge Add-ons').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('sourceListingUrl rendering for various ID patterns', () => {
    it('renders listing link for chrome: prefixed id', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'chrome:abcdefghijklmnopabcdefghijklmnop' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'chrome:abcdefghijklmnopabcdefghijklmnop' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLink = document.querySelector('.extension-identity-store[href]');
      expect(storeLink).toHaveAttribute('href', 'https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop');
    });

    it('renders listing link for firefox: prefixed id', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'firefox:ublock-origin' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'firefox:ublock-origin' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLink = document.querySelector('.extension-identity-store[href]');
      expect(storeLink).toHaveAttribute('href', 'https://addons.mozilla.org/firefox/addon/ublock-origin/');
    });

    it('renders listing link for edge: prefixed id with valid chrome pattern', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'edge:abcdefghijklmnopabcdefghijklmnop' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'edge:abcdefghijklmnopabcdefghijklmnop' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLink = document.querySelector('.extension-identity-store[href]');
      expect(storeLink).toHaveAttribute('href', 'https://microsoftedge.microsoft.com/addons/detail/abcdefghijklmnopabcdefghijklmnop');
    });

    it('renders listing link for opera: prefixed id', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'opera:ublock' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'opera:ublock' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLink = document.querySelector('.extension-identity-store[href]');
      expect(storeLink).toHaveAttribute('href', 'https://addons.opera.com/en/extensions/details/ublock/');
    });

    it('renders no listing link for chrome: prefix with non-chrome ID', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'chrome:not-an-id' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'chrome:not-an-id' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLinks = document.querySelectorAll('.extension-identity-store[href]');
      expect(storeLinks.length).toBe(0);
    });

    it('renders no listing link for edge: prefix with non-chrome ID', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'edge:not-a-valid-id' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'edge:not-a-valid-id' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLinks = document.querySelectorAll('.extension-identity-store[href]');
      expect(storeLinks.length).toBe(0);
    });

    it('renders no listing link for opera: with empty slug', async () => {
      mockFetchWithReport(buildReport({
        source: { type: 'id', value: 'opera:' }
      }));
      render(<App />);
      fireEvent.change(screen.getByLabelText('Extension URL or ID'), {
        target: { value: 'opera:' }
      });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze' }));
      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });

      const storeLinks = document.querySelectorAll('.extension-identity-store[href]');
      expect(storeLinks.length).toBe(0);
    });
  });

  describe('formatBytes rendering via upload file info', () => {
    it('shows bytes for files under 1 KB', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
      const file = new File(['x'], 'tiny.zip', { type: 'application/zip' });
      Object.defineProperty(file, 'size', { value: 500 });
      fireEvent.change(screen.getByLabelText('Extension package file'), { target: { files: [file] } });
      expect(screen.getByText(/500 B/)).toBeInTheDocument();
    });

    it('shows KB for files between 1 KB and 1 MB', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
      const file = new File(['x'], 'medium.zip', { type: 'application/zip' });
      Object.defineProperty(file, 'size', { value: 1024 * 50 });
      fireEvent.change(screen.getByLabelText('Extension package file'), { target: { files: [file] } });
      expect(screen.getByText(/50.0 KB/)).toBeInTheDocument();
    });

    it('shows MB for files over 1 MB', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
      const file = new File(['x'], 'large.zip', { type: 'application/zip' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 * 2.5 });
      fireEvent.change(screen.getByLabelText('Extension package file'), { target: { files: [file] } });
      expect(screen.getByText(/2.5 MB/)).toBeInTheDocument();
    });
  });

  describe('theme cycling', () => {
    it('cycles through system → light → dark', () => {
      render(<App />);
      const themeBtn = screen.getByRole('button', { name: /Theme: system/ });
      fireEvent.click(themeBtn);
      expect(screen.getByRole('button', { name: /Theme: light/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Theme: light/ }));
      expect(screen.getByRole('button', { name: /Theme: dark/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Theme: dark/ }));
      expect(screen.getByRole('button', { name: /Theme: system/ })).toBeInTheDocument();
    });
  });

  describe('routing: terms and privacy pages', () => {
    it('navigates to terms page and back', () => {
      render(<App />);
      const termsLink = screen.getByRole('link', { name: 'Terms' });
      fireEvent.click(termsLink);
      expect(screen.getByText('Back')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Back'));
      expect(screen.getByLabelText('Extension URL or ID')).toBeInTheDocument();
    });

    it('navigates to privacy page and back', () => {
      render(<App />);
      const privacyLink = screen.getByRole('link', { name: 'Privacy' });
      fireEvent.click(privacyLink);
      expect(screen.getByText('Back')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Back'));
      expect(screen.getByLabelText('Extension URL or ID')).toBeInTheDocument();
    });

    it('opens terms route directly from URL', () => {
      globalThis.history.replaceState(null, '', '/terms');
      render(<App />);
      expect(screen.getByText('Back')).toBeInTheDocument();
    });

    it('opens privacy route directly from URL', () => {
      globalThis.history.replaceState(null, '', '/privacy');
      render(<App />);
      expect(screen.getByText('Back')).toBeInTheDocument();
    });
  });

  describe('brand click navigates home', () => {
    it('clicking brand from results navigates to scan', async () => {
      mockFetchWithReport(buildReport());
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');

      const brand = document.querySelector('.brand') as HTMLAnchorElement;
      expect(brand).toBeTruthy();
      fireEvent.click(brand);
      expect(screen.getByLabelText('Extension URL or ID')).toBeInTheDocument();
    });
  });

  describe('version display', () => {
    it('displays version when version.txt returns a valid version', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (typeof input === 'string' && input.endsWith('/version.txt')) {
          return Promise.resolve(new Response('26.314.830\n', {
            status: 200,
            headers: { 'content-type': 'text/plain' }
          }));
        }

        return Promise.resolve(new Response('', { status: 404 }));
      });

      render(<App />);
      await waitFor(() => {
        expect(screen.getByText('v26.314.830')).toBeInTheDocument();
      });
    });

    it('hides version when version.txt returns invalid format', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (typeof input === 'string' && input.endsWith('/version.txt')) {
          return Promise.resolve(new Response('not-a-version', {
            status: 200,
            headers: { 'content-type': 'text/plain' }
          }));
        }

        return Promise.resolve(new Response('', { status: 404 }));
      });

      render(<App />);

      // Give some time for the hook to resolve
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText(/^v/)).toBeNull();
    });

    it('hides version when version.txt returns HTML content type', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (typeof input === 'string' && input.endsWith('/version.txt')) {
          return Promise.resolve(new Response('<!doctype html>', {
            status: 200,
            headers: { 'content-type': 'text/html' }
          }));
        }

        return Promise.resolve(new Response('', { status: 404 }));
      });

      render(<App />);
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText(/^v/)).toBeNull();
    });
  });

  describe('upload submission flow', () => {
    it('submits an uploaded file and shows report', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (typeof input === 'string' && input.endsWith('/version.txt')) {
          return Promise.resolve(new Response('', { status: 404 }));
        }

        return Promise.resolve(new Response(JSON.stringify(buildReport({
          source: { type: 'file', filename: 'extension.zip', mimeType: 'application/zip' }
        })), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }));
      });

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
      const file = new File(['dummy'], 'extension.zip', { type: 'application/zip' });
      fireEvent.change(screen.getByLabelText('Extension package file'), { target: { files: [file] } });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze Upload' }));

      await waitFor(() => {
        expect(screen.getByText('Helper Test Extension')).toBeInTheDocument();
      });
    });

    it('shows error when upload submission fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        if (typeof input === 'string' && input.endsWith('/version.txt')) {
          return Promise.resolve(new Response('', { status: 404 }));
        }

        return Promise.resolve(new Response(JSON.stringify({ error: 'Upload failed' }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }));
      });

      render(<App />);
      fireEvent.click(screen.getByRole('tab', { name: 'Upload' }));
      const file = new File(['dummy'], 'extension.zip', { type: 'application/zip' });
      fireEvent.change(screen.getByLabelText('Extension package file'), { target: { files: [file] } });
      fireEvent.click(screen.getByRole('button', { name: 'Analyze Upload' }));

      await waitFor(() => {
        expect(screen.getByText('Upload failed')).toBeInTheDocument();
      });
    });
  });

  describe('code execution analysis phase', () => {
    it('renders code analysis as complete when flag is true', async () => {
      mockFetchWithReport(buildReport({
        limits: {
          codeExecutionAnalysisPerformed: true,
          codeAnalysisMode: 'lite',
          codeAnalysisFilesScanned: 3,
          codeAnalysisBytesScanned: 2048,
          codeAnalysisFilesSkipped: 0,
          codeAnalysisBudgetExhausted: false,
          notes: ['Full analysis.']
        }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');

      fireEvent.click(screen.getByRole('tab', { name: /Phases/i }));
      // Phase 3 detail now describes the lite code scan result
      expect(screen.getByText(/Complete.*Lite pattern-based code scan analyzed 3 JS file/i)).toBeInTheDocument();
    });

    it('renders code analysis as partial when budget was exhausted', async () => {
      mockFetchWithReport(buildReport({
        limits: {
          codeExecutionAnalysisPerformed: true,
          codeAnalysisMode: 'lite',
          codeAnalysisFilesScanned: 5,
          codeAnalysisBytesScanned: 500_000,
          codeAnalysisFilesSkipped: 10,
          codeAnalysisBudgetExhausted: true,
          notes: []
        }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');

      fireEvent.click(screen.getByRole('tab', { name: /Phases/i }));
      expect(screen.getByText(/Partial.*Analyzed 5 JS file/i)).toBeInTheDocument();
    });

    it('renders code analysis as not-available when flag is false', async () => {
      mockFetchWithReport(buildReport({
        limits: {
          codeExecutionAnalysisPerformed: false,
          notes: []
        }
      }));
      await submitUrlAndWaitForReport('https://chromewebstore.google.com/detail/test-ext/abcdefghijklmnopabcdefghijklmnop');

      fireEvent.click(screen.getByRole('tab', { name: /Phases/i }));
      expect(screen.getByText(/No JavaScript files were found/i)).toBeInTheDocument();
    });
  });
});
