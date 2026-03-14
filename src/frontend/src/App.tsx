import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AnalysisProgressEvent, AnalysisReport, RiskSignal, Severity, StoreMetadata } from '@extensionchecker/shared';
import { analyzeExtensionById, analyzeExtensionByUpload, analyzeExtensionByUrl } from './api';
import { buildPermissionDetails } from './permission-explainer';
import { resolveExtensionDisplayName } from './report-display';

type ThemePreference = 'system' | 'light' | 'dark';
type SubmissionMode = 'url' | 'id' | 'file';
type ResultTab = 'overview' | 'findings' | 'metadata' | 'phases';
type PhaseStatus = 'complete' | 'not-available';
type Tone = 'info' | 'good' | 'caution' | 'danger';
type AppRoute = 'scan' | 'results';
const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const CHROME_EXTENSION_ID_REGEX = /^[a-p]{32}$/;
const SAFARI_APP_STORE_ID_REGEX = /^id\d{6,}$/i;
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

function toneForSeverity(severity: Severity): Tone {
  if (severity === 'critical' || severity === 'high') {
    return 'danger';
  }

  if (severity === 'medium') {
    return 'caution';
  }

  return 'good';
}

function scoreBand(score: number): string {
  if (score <= 20) {
    return 'Low';
  }

  if (score <= 40) {
    return 'Low / Medium';
  }

  if (score <= 60) {
    return 'Medium';
  }

  if (score <= 80) {
    return 'Medium / High';
  }

  return 'High';
}

function scoreColor(score: number): string {
  if (score <= 25) {
    return '#22c55e';
  }

  if (score <= 50) {
    return '#f59e0b';
  }

  return '#ef4444';
}

function verdictLabel(report: AnalysisReport): string {
  if (report.score.severity === 'critical') {
    return 'High Danger';
  }

  if (report.score.severity === 'high') {
    return 'Dangerous';
  }

  if (report.score.severity === 'medium') {
    return 'Use Caution';
  }

  return report.riskSignals.length === 0 ? 'Likely Low Risk' : 'Low Risk, Review Recommended';
}

function verdictExplanation(report: AnalysisReport): string {
  if (report.score.severity === 'critical' || report.score.severity === 'high') {
    return 'This extension requests combinations of capabilities that can expose browsing data, sessions, or page content at scale.';
  }

  if (report.score.severity === 'medium') {
    return 'This extension has meaningful access that may be acceptable for its purpose, but it should be reviewed before trust.';
  }

  return 'No high-impact manifest combinations were detected in this static manifest-first analysis.';
}

function sourceStoreLabel(report: AnalysisReport): string {
  if (report.source.type === 'file') {
    return 'Uploaded package';
  }

  const value = report.source.value;

  if (report.source.type === 'id') {
    if (value.startsWith('chrome:') || /^[a-p]{32}$/.test(value)) {
      return 'Chrome Web Store';
    }

    if (value.startsWith('firefox:')) {
      return 'Firefox Add-ons';
    }

    if (value.startsWith('edge:')) {
      return 'Edge Add-ons';
    }

    if (value.startsWith('safari:')) {
      return 'Safari Extensions';
    }

    return 'Extension ID';
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('chromewebstore.google.com') || host.includes('chrome.google.com') || host.includes('clients2.google.com')) {
      return 'Chrome Web Store';
    }

    if (host.includes('addons.mozilla.org')) {
      return 'Firefox Add-ons';
    }

    if (host.includes('microsoftedge.microsoft.com') || host.includes('edge.microsoft.com')) {
      return 'Edge Add-ons';
    }

    if (host.includes('safari') || host.includes('apple.com')) {
      return 'Safari Extensions';
    }
  } catch {
    return 'Unknown store';
  }

  return 'Unknown store';
}

function sourceListingUrl(report: AnalysisReport): string | null {
  if (report.source.type === 'url') {
    try {
      const parsed = new URL(report.source.value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  if (report.source.type === 'id') {
    const raw = report.source.value.trim();

    if (/^[a-p]{32}$/.test(raw)) {
      return `https://chromewebstore.google.com/detail/${raw}`;
    }

    if (raw.startsWith('chrome:')) {
      const id = raw.replace(/^chrome:/, '');
      if (/^[a-p]{32}$/.test(id)) {
        return `https://chromewebstore.google.com/detail/${id}`;
      }
      return null;
    }

    if (raw.startsWith('firefox:')) {
      const addOnId = raw.replace(/^firefox:/, '');
      return addOnId ? `https://addons.mozilla.org/firefox/addon/${encodeURIComponent(addOnId)}/` : null;
    }

    if (raw.startsWith('edge:')) {
      const id = raw.replace(/^edge:/, '');
      if (/^[a-p]{32}$/.test(id)) {
        return `https://microsoftedge.microsoft.com/addons/detail/${id}`;
      }
      return null;
    }
  }

  return null;
}

function isLikelySafariExtensionId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^safari:/i.test(trimmed)) {
    return true;
  }

  return SAFARI_APP_STORE_ID_REGEX.test(trimmed);
}

function looksLikeValidChromeId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^chrome:/i.test(trimmed)) {
    return CHROME_EXTENSION_ID_REGEX.test(trimmed.replace(/^chrome:/i, ''));
  }

  return CHROME_EXTENSION_ID_REGEX.test(trimmed);
}

function isSafariStoreInputUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === 'apps.apple.com' || host === 'itunes.apple.com';
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function explainSignalImpact(signal: RiskSignal): string {
  if (signal.severity === 'critical' || signal.severity === 'high') {
    return 'Potentially dangerous capability with broad misuse potential.';
  }

  if (signal.severity === 'medium') {
    return 'Meaningful capability that can affect privacy or integrity depending on implementation.';
  }

  return 'Lower-impact capability, but still relevant to overall trust.';
}

function iconForTone(tone: Tone): string {
  if (tone === 'danger') {
    return 'dangerous';
  }

  if (tone === 'caution') {
    return 'warning';
  }

  if (tone === 'good') {
    return 'check_circle';
  }

  return 'info';
}

function iconForTheme(theme: ThemePreference): string {
  if (theme === 'light') {
    return 'light_mode';
  }

  if (theme === 'dark') {
    return 'dark_mode';
  }

  return 'computer';
}

function phaseTone(status: PhaseStatus): Tone {
  return status === 'complete' ? 'good' : 'caution';
}

function phaseIcon(status: PhaseStatus): string {
  return status === 'complete' ? 'check_circle' : 'pending';
}

function phaseStatusLabel(status: PhaseStatus): string {
  return status === 'complete' ? 'Complete' : 'Not Available';
}

function routeFromPath(pathname: string): AppRoute {
  return pathname.startsWith('/results') ? 'results' : 'scan';
}

function useThemePreference(): [ThemePreference, (nextTheme: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const persisted = globalThis.localStorage?.getItem('theme');
    if (persisted === 'light' || persisted === 'dark' || persisted === 'system') {
      return persisted;
    }

    return 'system';
  });

  const applyTheme = useCallback((nextTheme: ThemePreference): void => {
    setTheme(nextTheme);
    globalThis.localStorage?.setItem('theme', nextTheme);

    const root = globalThis.document?.documentElement;
    if (!root) {
      return;
    }

    if (nextTheme === 'system') {
      root.removeAttribute('data-theme');
      return;
    }

    root.setAttribute('data-theme', nextTheme);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [applyTheme, theme]);

  return [theme, applyTheme];
}

export function App(): JSX.Element {
  const [theme, setTheme] = useThemePreference();
  const [mode, setMode] = useState<SubmissionMode>('url');
  const [url, setUrl] = useState('');
  const [extensionId, setExtensionId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(globalThis.location?.pathname ?? '/'));
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressEvent | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const safariIdHint = useMemo(() => (mode === 'id' ? isLikelySafariExtensionId(extensionId) : false), [mode, extensionId]);
  const chromeIdFormatHint = useMemo(() => {
    if (mode !== 'id') {
      return false;
    }

    const trimmed = extensionId.trim();
    if (!trimmed || safariIdHint) {
      return false;
    }

    const prefixed = /^(chrome|firefox|safari):/i.test(trimmed);
    const maybeChromeCandidate = /^[a-z]+$/i.test(trimmed) && trimmed.length >= 16;
    if (prefixed || !maybeChromeCandidate) {
      return false;
    }

    return !looksLikeValidChromeId(trimmed);
  }, [mode, extensionId, safariIdHint]);

  const canSubmit = useMemo(() => {
    if (mode === 'url') {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }

    if (mode === 'id') {
      return extensionId.trim().length > 0 && !isLikelySafariExtensionId(extensionId);
    }

    return uploadFile !== null;
  }, [extensionId, mode, uploadFile, url]);

  const sortedSignals = useMemo(() => {
    if (!report) {
      return [];
    }

    return [...report.riskSignals].sort((a, b) => {
      const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return b.scoreImpact - a.scoreImpact;
    });
  }, [report]);

  const phases = useMemo(() => {
    if (!report) {
      return [];
    }

    const codePhaseStatus: PhaseStatus = report.limits.codeExecutionAnalysisPerformed ? 'complete' : 'not-available';

    return [
      {
        id: 'manifest',
        title: 'Phase 1: Manifest Analysis',
        status: 'complete' as const,
        detail: 'Complete. Parsed manifest metadata, permissions, host access, and manifest-declared capability combinations.'
      },
      {
        id: 'code',
        title: 'Phase 2: Code Analysis',
        status: codePhaseStatus,
        detail: codePhaseStatus === 'complete'
          ? 'Complete. Source and behavior-level analysis was executed.'
          : 'Not available in this version. Deep semantic code review and runtime behavior detonation were not performed.'
      }
    ];
  }, [report]);

  const permissionDetails = useMemo(() => {
    if (!report) {
      return [];
    }

    return buildPermissionDetails(report);
  }, [report]);
  const listingUrl = useMemo(() => (report ? sourceListingUrl(report) : null), [report]);
  const safariUrlHint = useMemo(() => (mode === 'url' ? isSafariStoreInputUrl(url) : false), [mode, url]);

  useEffect(() => {
    const onPopState = (): void => {
      setRoute(routeFromPath(globalThis.location?.pathname ?? '/'));
    };

    globalThis.addEventListener('popstate', onPopState);
    return () => globalThis.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((nextRoute: AppRoute, options?: { query?: URLSearchParams; replace?: boolean }) => {
    const basePath = nextRoute === 'results' ? '/results' : '/';
    const query = options?.query?.toString();
    const nextPath = query ? `${basePath}?${query}` : basePath;
    const currentPath = `${globalThis.location?.pathname ?? '/'}${globalThis.location?.search ?? ''}`;

    if (currentPath !== nextPath) {
      if (options?.replace) {
        globalThis.history?.replaceState(null, '', nextPath);
      } else {
        globalThis.history?.pushState(null, '', nextPath);
      }
    }

    setRoute(nextRoute);
  }, []);

  const resultsQuery = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (mode === 'url' && url.trim()) {
      params.set('extensionUrl', url.trim());
      return params;
    }

    if (mode === 'id' && extensionId.trim()) {
      params.set('extensionId', extensionId.trim());
      return params;
    }

    if (mode === 'file' && uploadFile?.name) {
      params.set('filename', uploadFile.name);
    }

    return params;
  }, [extensionId, mode, uploadFile?.name, url]);

  const submit = useCallback(async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setProgress(null);

    const onProgress = (evt: AnalysisProgressEvent): void => {
      setProgress(evt);
    };

    try {
      const nextReport = mode === 'url'
        ? await analyzeExtensionByUrl(url, onProgress)
        : mode === 'id'
          ? await analyzeExtensionById(extensionId, onProgress)
          : await analyzeExtensionByUpload(uploadFile as File, onProgress);

      setReport(nextReport);
      setActiveTab('overview');
      navigateTo('results', { query: resultsQuery() });
    } catch (submitError) {
      setReport(null);
      setError(submitError instanceof Error ? submitError.message : 'Unexpected error');
    } finally {
      setIsSubmitting(false);
      setProgress(null);
    }
  }, [canSubmit, extensionId, mode, navigateTo, resultsQuery, uploadFile, url]);

  const currentThemeIndex = Math.max(0, THEME_ORDER.indexOf(theme));
  const nextTheme: ThemePreference = THEME_ORDER[(currentThemeIndex + 1) % THEME_ORDER.length] ?? 'system';

  const exportPdf = async (): Promise<void> => {
    if (!report || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);
    try {
      const { downloadReportPdf } = await import('./pdf-report');
      await downloadReportPdf(report);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to generate PDF report.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const openScanner = (): void => {
    navigateTo('scan');
    globalThis.requestAnimationFrame?.(() => {
      globalThis.document?.getElementById('analysis-intake')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <main className="page">
      <section className="card">
        <header className="header">
          <div className="brand">
            <img src="/brand-icon.svg" alt="ExtensionChecker logo" className="brand-icon" />
            <h1>ExtensionChecker</h1>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(nextTheme)}
            aria-label={`Theme: ${theme}. Switch to ${nextTheme}.`}
            title={`Theme: ${theme}. Switch to ${nextTheme}.`}
          >
            <span className="material-symbols-outlined" aria-hidden="true">{iconForTheme(theme)}</span>
          </button>
        </header>

        {route === 'scan' ? (
          <section id="analysis-intake" className="intake">
            <div className="intake-head">
              <div className="intake-copy">
                <p className="intake-label">Input</p>
                <p className="description">Analyze browser extensions by package URL, store listing URL, extension ID, or uploaded package file.</p>
              </div>
            </div>

            <form onSubmit={submit} className="form">
              <label htmlFor="mode">Input mode</label>
              <select
                id="mode"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as SubmissionMode);
                  setError(null);
                }}
              >
                <option value="url">Package URL</option>
                <option value="id">Extension ID</option>
                <option value="file">Package Upload</option>
              </select>

              {mode === 'url' ? (
                <>
                  <label htmlFor="url">Extension package URL</label>
                  <input
                    id="url"
                    type="url"
                    placeholder="https://chromewebstore.google.com/detail/... or https://addons.mozilla.org/firefox/addon/... or https://microsoftedge.microsoft.com/addons/detail/..."
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    required
                  />
                  <p className="field-hint">
                    Supported URL sources: <code>chromewebstore.google.com</code>, <code>chrome.google.com</code>, <code>clients2.google.com</code>, <code>addons.mozilla.org</code>, and <code>microsoftedge.microsoft.com</code>.
                    Safari App Store pages (<code>apps.apple.com</code>) cannot be analyzed directly from URL because Apple does not expose extension package downloads from listings.
                  </p>
                  {safariUrlHint ? (
                    <p className="field-hint warning">
                      Safari listing detected. Use <strong>Package Upload</strong> only if you already have a separate extension archive (for example from developer build artifacts).
                    </p>
                  ) : null}
                </>
              ) : null}

              {mode === 'id' ? (
                <>
                  <label htmlFor="extension-id">Extension ID</label>
                  <input
                    id="extension-id"
                    type="text"
                    placeholder="chrome:abcdefghijklmnopabcdefghijklmnop"
                    value={extensionId}
                    onChange={(event) => setExtensionId(event.target.value)}
                    required
                  />
                  <p className="field-hint">
                    Chrome IDs must be 32 characters using letters <code>a</code>-<code>p</code>. Firefox supports add-on slugs or <code>firefox:&lt;id&gt;</code>. Edge supports <code>edge:&lt;id&gt;</code> (32-character ID).
                  </p>
                  {chromeIdFormatHint ? (
                    <p className="field-hint warning">
                      This looks like a Chrome-style ID, but the format is invalid. Use a 32-character ID with letters a-p.
                    </p>
                  ) : null}
                  {safariIdHint ? (
                    <p className="field-hint warning">
                      Safari App Store IDs are not supported in Extension ID mode. Use <strong>Package Upload</strong> only with an extension archive you already obtained separately.
                    </p>
                  ) : null}
                </>
              ) : null}

              {mode === 'file' ? (
                <>
                  <label htmlFor="package-file">Extension package file</label>
                  <input
                    id="package-file"
                    type="file"
                    accept=".zip,.xpi,.crx"
                    onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    required
                  />
                </>
              ) : null}

              <button type="submit" disabled={!canSubmit || isSubmitting} aria-busy={isSubmitting}>
                <span className="button-content">
                  {isSubmitting ? (
                    <span className="button-loading">
                      <span className="button-spinner" aria-hidden="true" />
                      {progress ? progress.message : 'Analyzing\u2026'}
                    </span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined button-icon" aria-hidden="true">search</span>
                      Analyze
                    </>
                  )}
                </span>
              </button>
              {isSubmitting && progress ? (
                <div className="analysis-progress" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label={progress.message}>
                  <div className="analysis-progress-track">
                    <div className="analysis-progress-fill" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <span className="analysis-progress-label">{progress.message}</span>
                </div>
              ) : null}
            </form>
            {error ? <p className="error">{error}</p> : null}
          </section>
        ) : null}

        {route === 'results' ? (
          report ? (
          <section className="report" aria-live="polite">
            <div className="results-nav">
              <button type="button" className="results-nav-link" onClick={openScanner}>
                <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                Back to Scanner
              </button>
            </div>

            <div className="report-topbar">
              <section className="extension-identity" aria-label="Analyzed extension metadata">
                <div className="extension-identity-head">
                  <p className="extension-identity-label">Analyzed Extension</p>
                  <div className="report-tools">
                    <button
                      type="button"
                      className="report-tool-icon-button"
                      onClick={exportPdf}
                      disabled={isExportingPdf}
                      title={isExportingPdf ? 'Preparing PDF report' : 'Download PDF report'}
                      aria-label={isExportingPdf ? 'Preparing PDF report' : 'Download PDF report'}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {isExportingPdf ? 'progress_activity' : 'download'}
                      </span>
                    </button>
                  </div>
                </div>
                <h2 className="extension-identity-name">{resolveExtensionDisplayName(report)}</h2>
                <div className="extension-identity-meta">
                  <p className="extension-identity-version">
                    <span className="material-symbols-outlined" aria-hidden="true">deployed_code</span>
                    Version {report.metadata.version} (MV{report.metadata.manifestVersion})
                  </p>
                  {listingUrl ? (
                    <a
                      className="extension-identity-store"
                      href={listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open extension listing"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">storefront</span>
                      {sourceStoreLabel(report)}
                    </a>
                  ) : (
                    <p className="extension-identity-store">
                      <span className="material-symbols-outlined" aria-hidden="true">storefront</span>
                      {sourceStoreLabel(report)}
                    </p>
                  )}
                </div>
              </section>
            </div>

            <nav className="result-tabs" role="tablist" aria-label="Analysis sections">
              <button
                type="button"
                role="tab"
                id="result-tab-overview"
                aria-selected={activeTab === 'overview'}
                aria-controls="result-panel-overview"
                className={`result-tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">dashboard</span>
                <span className="result-tab-label">Overview</span>
              </button>
              <button
                type="button"
                role="tab"
                id="result-tab-findings"
                aria-selected={activeTab === 'findings'}
                aria-controls="result-panel-findings"
                className={`result-tab ${activeTab === 'findings' ? 'active' : ''}`}
                onClick={() => setActiveTab('findings')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">warning</span>
                <span className="result-tab-label">Findings</span>
              </button>
              <button
                type="button"
                role="tab"
                id="result-tab-metadata"
                aria-selected={activeTab === 'metadata'}
                aria-controls="result-panel-metadata"
                className={`result-tab ${activeTab === 'metadata' ? 'active' : ''}`}
                onClick={() => setActiveTab('metadata')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">info</span>
                <span className="result-tab-label">Metadata</span>
              </button>
              <button
                type="button"
                role="tab"
                id="result-tab-phases"
                aria-selected={activeTab === 'phases'}
                aria-controls="result-panel-phases"
                className={`result-tab ${activeTab === 'phases' ? 'active' : ''}`}
                onClick={() => setActiveTab('phases')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">account_tree</span>
                <span className="result-tab-label">Phases</span>
              </button>
            </nav>

            {activeTab === 'overview' ? (
              <section id="result-panel-overview" role="tabpanel" aria-labelledby="result-tab-overview" className="result-panel">
                <div className={`verdict verdict-${toneForSeverity(report.score.severity)}`}>
                  <div
                    className="score-donut"
                    style={{
                      ['--score' as string]: report.score.value,
                      ['--score-color' as string]: scoreColor(report.score.value)
                    }}
                  >
                    <div className="score-donut-inner">
                      <strong>{report.score.value}</strong>
                      <span>/100</span>
                    </div>
                    <div className="score-band">{scoreBand(report.score.value)}</div>
                  </div>

                  <div className="verdict-main">
                    <p className="verdict-label">Overall Verdict</p>
                    <h2>
                      <span className={`material-symbols-outlined tone-icon ${toneForSeverity(report.score.severity)}`} aria-hidden="true">
                        {iconForTone(toneForSeverity(report.score.severity))}
                      </span>
                      {verdictLabel(report)}
                    </h2>
                    <p className="verdict-score">
                      Risk score <strong>{report.score.value}/100</strong> ({report.score.severity})
                    </p>
                    <p>{verdictExplanation(report)}</p>
                  </div>
                </div>

                <div className="meta-grid">
                  <article className="info-card info">
                    <h3>Submission Source</h3>
                    {listingUrl ? (
                      <p>
                        <strong>
                          <a className="source-link" href={listingUrl} target="_blank" rel="noopener noreferrer">
                            {sourceStoreLabel(report)}
                          </a>
                        </strong>
                      </p>
                    ) : (
                      <p><strong>{sourceStoreLabel(report)}</strong></p>
                    )}
                    <p className="source-value">{report.source.type === 'file' ? report.source.filename : report.source.value}</p>
                  </article>
                  <article className="info-card good">
                    <h3>Declared Permissions</h3>
                    <p>{report.permissions.requestedPermissions.length} requested</p>
                    <p>{report.permissions.optionalPermissions.length} optional</p>
                    <p>{report.permissions.hostPermissions.length} host scopes</p>
                  </article>
                  <article className="info-card caution">
                    <h3>Review Signals</h3>
                    <p>{report.riskSignals.length} risk signals detected</p>
                    <p>{report.summary}</p>
                  </article>
                </div>

                <section className="permissions-section">
                  <h3>Declared Permissions and Access</h3>
                  {permissionDetails.length === 0 ? (
                    <p className="empty-signals">No declared permissions or host scopes were found.</p>
                  ) : (
                    <ul className="permission-list">
                      {permissionDetails.map((entry) => (
                        <li key={entry.id} className={`permission-entry severity-${entry.severity}`}>
                          <div className="permission-entry-head">
                            <strong>{entry.permission}</strong>
                            <div className="permission-entry-tags">
                              <span className="source-pill">{entry.sourceLabel}</span>
                              <span className={`severity-pill severity-${entry.severity}`}>{entry.severity}</span>
                            </div>
                          </div>
                          <p>{entry.explanation}</p>
                          <p className="permission-danger">{entry.danger}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </section>
            ) : null}

            {activeTab === 'findings' ? (
              <section id="result-panel-findings" role="tabpanel" aria-labelledby="result-tab-findings" className="result-panel">
                <section className="signals">
                  <h3>Why This Extension May Be Risky</h3>
                  {sortedSignals.length === 0 ? (
                    <p className="empty-signals">No specific high-impact risk signals were detected from manifest declarations.</p>
                  ) : (
                    <ul className="signal-list">
                      {sortedSignals.map((signal) => (
                        <li key={signal.id} className={`signal severity-${signal.severity}`}>
                          <div className="signal-header">
                            <strong>
                              <span className={`material-symbols-outlined signal-icon severity-${signal.severity}`} aria-hidden="true">
                                {signal.severity === 'low' ? 'check_circle' : signal.severity === 'medium' ? 'warning' : 'cancel'}
                              </span>
                              {signal.title}
                            </strong>
                            <span className={`severity-pill severity-${signal.severity}`}>{signal.severity}</span>
                          </div>
                          <p>{signal.description}</p>
                          <p className="signal-impact">{explainSignalImpact(signal)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </section>
            ) : null}

            {activeTab === 'metadata' ? (
              <section id="result-panel-metadata" role="tabpanel" aria-labelledby="result-tab-metadata" className="result-panel">
                <section className="metadata-section">
                  <h3>Extension Metadata</h3>
                  <div className="metadata-grid">
                    <article className="info-card info">
                      <h4>Package Details</h4>
                      <dl className="metadata-list">
                        <dt>Extension Name</dt>
                        <dd>{report.metadata.name}</dd>
                        <dt>Version</dt>
                        <dd>{report.metadata.version}</dd>
                        <dt>Manifest Version</dt>
                        <dd>MV{report.metadata.manifestVersion}</dd>
                        {report.storeMetadata?.shortName ? (
                          <>
                            <dt>Short Name</dt>
                            <dd>{report.storeMetadata.shortName}</dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.packageSizeBytes ? (
                          <>
                            <dt>Package Size</dt>
                            <dd>{formatBytes(report.storeMetadata.packageSizeBytes)}</dd>
                          </>
                        ) : null}
                      </dl>
                    </article>

                    <article className="info-card info">
                      <h4>Developer Information</h4>
                      <dl className="metadata-list">
                        {report.storeMetadata?.author ? (
                          <>
                            <dt>Author</dt>
                            <dd>{report.storeMetadata.author}</dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.developerName ? (
                          <>
                            <dt>Developer</dt>
                            <dd>{report.storeMetadata.developerName}</dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.developerUrl ? (
                          <>
                            <dt>Developer Website</dt>
                            <dd>
                              <a href={report.storeMetadata.developerUrl} target="_blank" rel="noopener noreferrer">
                                {report.storeMetadata.developerUrl}
                              </a>
                            </dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.homepageUrl ? (
                          <>
                            <dt>Homepage</dt>
                            <dd>
                              <a href={report.storeMetadata.homepageUrl} target="_blank" rel="noopener noreferrer">
                                {report.storeMetadata.homepageUrl}
                              </a>
                            </dd>
                          </>
                        ) : null}
                        {!report.storeMetadata?.author && !report.storeMetadata?.developerName && !report.storeMetadata?.developerUrl && !report.storeMetadata?.homepageUrl ? (
                          <p className="empty-signals">No developer information available in the manifest.</p>
                        ) : null}
                      </dl>
                    </article>

                    <article className="info-card info">
                      <h4>Store &amp; Source</h4>
                      <dl className="metadata-list">
                        <dt>Submission Source</dt>
                        <dd>{sourceStoreLabel(report)}</dd>
                        {report.storeMetadata?.storeUrl ? (
                          <>
                            <dt>Store Listing</dt>
                            <dd>
                              <a href={report.storeMetadata.storeUrl} target="_blank" rel="noopener noreferrer">
                                {report.storeMetadata.storeUrl}
                              </a>
                            </dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.category ? (
                          <>
                            <dt>Category</dt>
                            <dd>{report.storeMetadata.category}</dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.rating !== undefined ? (
                          <>
                            <dt>Rating</dt>
                            <dd>{report.storeMetadata.rating.toFixed(1)} / 5{report.storeMetadata.ratingCount !== undefined ? ` (${report.storeMetadata.ratingCount.toLocaleString()} ratings)` : ''}</dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.userCount !== undefined ? (
                          <>
                            <dt>Users</dt>
                            <dd>{report.storeMetadata.userCount.toLocaleString()}</dd>
                          </>
                        ) : null}
                        {report.storeMetadata?.lastUpdated ? (
                          <>
                            <dt>Last Updated</dt>
                            <dd>{report.storeMetadata.lastUpdated}</dd>
                          </>
                        ) : null}
                      </dl>
                    </article>
                  </div>

                  {report.storeMetadata?.description ? (
                    <article className="info-card info metadata-description">
                      <h4>Extension Description</h4>
                      <p>{report.storeMetadata.description}</p>
                    </article>
                  ) : null}

                  {report.storeMetadata?.privacyPolicyUrl || report.storeMetadata?.supportUrl ? (
                    <article className="info-card info">
                      <h4>Additional Links</h4>
                      <dl className="metadata-list">
                        {report.storeMetadata.privacyPolicyUrl ? (
                          <>
                            <dt>Privacy Policy</dt>
                            <dd>
                              <a href={report.storeMetadata.privacyPolicyUrl} target="_blank" rel="noopener noreferrer">
                                {report.storeMetadata.privacyPolicyUrl}
                              </a>
                            </dd>
                          </>
                        ) : null}
                        {report.storeMetadata.supportUrl ? (
                          <>
                            <dt>Support</dt>
                            <dd>
                              <a href={report.storeMetadata.supportUrl} target="_blank" rel="noopener noreferrer">
                                {report.storeMetadata.supportUrl}
                              </a>
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </article>
                  ) : null}
                </section>
              </section>
            ) : null}

            {activeTab === 'phases' ? (
              <section id="result-panel-phases" role="tabpanel" aria-labelledby="result-tab-phases" className="result-panel">
                <section className="phase-list-section">
                  <h3>Analysis Pipeline Status</h3>
                  <ul className="phase-list">
                    {phases.map((phase) => (
                      <li key={phase.id} className={`phase-card ${phase.status}`}>
                        <div className="phase-head">
                          <strong>
                            <span className={`material-symbols-outlined tone-icon ${phaseTone(phase.status)}`} aria-hidden="true">
                              {phaseIcon(phase.status)}
                            </span>
                            {phase.title}
                          </strong>
                          <span className={`phase-status ${phase.status}`}>{phaseStatusLabel(phase.status)}</span>
                        </div>
                        <p>{phase.detail}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="limits info-card info">
                  <h3>Current Analysis Limits</h3>
                  <ul>
                    {report.limits.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              </section>
            ) : null}
          </section>
          ) : (
            <section className="results-empty">
              <h2>No Report Loaded</h2>
              <p>This route is ready for saved report snapshots, but no in-memory report is available yet.</p>
              <button type="button" className="results-nav-action" onClick={openScanner}>Go to Scanner</button>
            </section>
          )
        ) : null}
      </section>
    </main>
  );
}
