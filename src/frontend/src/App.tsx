import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AnalysisReport, RiskSignal, Severity } from '@extensionchecker/shared';
import { analyzeExtensionById, analyzeExtensionByUpload, analyzeExtensionByUrl } from './api';

type ThemePreference = 'system' | 'light' | 'dark';
type SubmissionMode = 'url' | 'id' | 'file';
type Tone = 'info' | 'good' | 'caution' | 'danger';
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

function displayName(report: AnalysisReport): string {
  return report.metadata.name.startsWith('__MSG_') ? 'Localized extension name (unresolved in package)' : report.metadata.name;
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      return extensionId.trim().length > 0;
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

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const nextReport = mode === 'url'
        ? await analyzeExtensionByUrl(url)
        : mode === 'id'
          ? await analyzeExtensionById(extensionId)
          : await analyzeExtensionByUpload(uploadFile as File);

      setReport(nextReport);
    } catch (submitError) {
      setReport(null);
      setError(submitError instanceof Error ? submitError.message : 'Unexpected error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel = mode === 'url' ? 'Analyze URL' : mode === 'id' ? 'Analyze ID' : 'Analyze Upload';

  return (
    <main className="page">
      <section className="card">
        <header className="header">
          <div className="brand">
            <img src="/brand-icon.svg" alt="ExtensionChecker logo" className="brand-icon" />
            <h1>ExtensionChecker</h1>
          </div>
          <div className="theme">
            <label htmlFor="theme">Theme</label>
            <select id="theme" value={theme} onChange={(event) => setTheme(event.target.value as ThemePreference)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </header>

        <p className="description">Analyze browser extensions by package URL, store listing URL, extension ID, or uploaded package file.</p>

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
                placeholder="https://example.com/extension.zip"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
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
                  Analyzing...
                </span>
              ) : (
                <>
                  <span className="material-symbols-outlined button-icon" aria-hidden="true">search</span>
                  {submitLabel}
                </>
              )}
            </span>
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}

        {report ? (
          <section className="report" aria-live="polite">
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
                <h3>Extension</h3>
                <p><strong>{displayName(report)}</strong></p>
                <p>Version {report.metadata.version} (MV{report.metadata.manifestVersion})</p>
              </article>
              <article className="info-card good">
                <h3>Declared Permissions</h3>
                <p>{report.permissions.requestedPermissions.length} requested</p>
                <p>{report.permissions.hostPermissions.length} host scopes</p>
              </article>
              <article className="info-card caution">
                <h3>Review Signals</h3>
                <p>{report.riskSignals.length} risk signals detected</p>
                <p>{report.summary}</p>
              </article>
            </div>

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

            <section className="limits info-card info">
              <h3>Analysis Scope</h3>
              <p>This result is manifest-first, not full runtime malware detonation.</p>
              <ul>
                {report.limits.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </section>
        ) : null}
      </section>
    </main>
  );
}
