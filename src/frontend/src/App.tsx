import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AnalysisProgressEvent, AnalysisReport } from '@extensionchecker/shared';
import type { AppRoute, SubmitTarget } from './types';
import { THEME_ORDER } from './constants';
import { useAppVersion } from './hooks/useAppVersion';
import { useThemePreference } from './hooks/useThemePreference';
import { detectSmartSubmission } from './utils/smart-submission';
import { routeFromPath, pathForRoute } from './utils/routing';
import { analyzeExtensionById, analyzeExtensionByUpload, analyzeExtensionByUrl } from './api';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ScanPage } from './pages/ScanPage';
import { ResultsPage } from './pages/ResultsPage';
import { MarkdownPage } from './pages/MarkdownPage';
import termsMarkdown from '@docs/TERMS.md?raw';
import privacyMarkdown from '@docs/PRIVACY.md?raw';

export function App() {
  const appVersion = useAppVersion();
  const [theme, setTheme] = useThemePreference();
  const [textInput, setTextInput] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [route, setRoute] = useState<AppRoute>(() => routeFromPath(globalThis.location?.pathname ?? '/'));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressEvent | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<SubmitTarget>(null);

  const smartSubmission = useMemo(() => detectSmartSubmission(textInput), [textInput]);
  const canSubmitText = smartSubmission.kind !== 'empty' && smartSubmission.canSubmit;
  const canSubmitUpload = uploadFile !== null;
  const textSubmitting = isSubmitting && submitTarget === 'text';
  const uploadSubmitting = isSubmitting && submitTarget === 'upload';

  useEffect(() => {
    const onPopState = (): void => {
      setRoute(routeFromPath(globalThis.location?.pathname ?? '/'));
    };

    globalThis.addEventListener('popstate', onPopState);
    return () => globalThis.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((nextRoute: AppRoute, options?: { query?: URLSearchParams; replace?: boolean }) => {
    const basePath = pathForRoute(nextRoute);
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

  const resultsQuery = useCallback((nextReport: AnalysisReport): URLSearchParams => {
    const params = new URLSearchParams();
    if (nextReport.source.type === 'url') {
      params.set('extensionUrl', nextReport.source.value);
      return params;
    }

    if (nextReport.source.type === 'id') {
      params.set('extensionId', nextReport.source.value);
      return params;
    }

    if (nextReport.source.type === 'file') {
      params.set('filename', nextReport.source.filename);
    }

    return params;
  }, []);

  const handleTextChange = useCallback((value: string) => {
    setTextInput(value);
    setError(null);
  }, []);

  const handleFileChange = useCallback((file: File | null) => {
    setUploadFile(file);
    setError(null);
  }, []);

  const submitText = useCallback(async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmitText) {
      return;
    }

    setIsSubmitting(true);
    setSubmitTarget('text');
    setError(null);
    setProgress(null);

    const onProgress = (evt: AnalysisProgressEvent): void => {
      setProgress(evt);
    };

    try {
      const nextReport = smartSubmission.kind === 'url'
        ? await analyzeExtensionByUrl(smartSubmission.normalizedValue, onProgress)
        : await analyzeExtensionById(smartSubmission.normalizedValue, onProgress);

      setReport(nextReport);
      navigateTo('results', { query: resultsQuery(nextReport) });
    } catch (submitError) {
      setReport(null);
      setError(submitError instanceof Error ? submitError.message : 'Unexpected error');
    } finally {
      setIsSubmitting(false);
      setSubmitTarget(null);
      setProgress(null);
    }
  }, [canSubmitText, navigateTo, resultsQuery, smartSubmission]);

  const submitUpload = useCallback(async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!uploadFile) {
      return;
    }

    setIsSubmitting(true);
    setSubmitTarget('upload');
    setError(null);
    setProgress(null);

    const onProgress = (evt: AnalysisProgressEvent): void => {
      setProgress(evt);
    };

    try {
      const nextReport = await analyzeExtensionByUpload(uploadFile, onProgress);

      setReport(nextReport);
      navigateTo('results', { query: resultsQuery(nextReport) });
    } catch (submitError) {
      setReport(null);
      setError(submitError instanceof Error ? submitError.message : 'Unexpected error');
    } finally {
      setIsSubmitting(false);
      setSubmitTarget(null);
      setProgress(null);
    }
  }, [navigateTo, resultsQuery, uploadFile]);

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

  const currentThemeIndex = Math.max(0, THEME_ORDER.indexOf(theme));
  const nextTheme = THEME_ORDER[(currentThemeIndex + 1) % THEME_ORDER.length] ?? 'system';

  return (
    <main className="page">
      <section className="card">
        <Header
          theme={theme}
          nextTheme={nextTheme}
          onThemeToggle={() => setTheme(nextTheme)}
          onNavigate={navigateTo}
        />

        {route === 'terms' ? (
          <MarkdownPage markdown={termsMarkdown} onBack={() => navigateTo('scan')} />
        ) : route === 'privacy' ? (
          <MarkdownPage markdown={privacyMarkdown} onBack={() => navigateTo('scan')} />
        ) : route === 'scan' ? (
          <ScanPage
            textInput={textInput}
            onTextChange={handleTextChange}
            smartSubmission={smartSubmission}
            canSubmitText={canSubmitText}
            uploadFile={uploadFile}
            onFileChange={handleFileChange}
            canSubmitUpload={canSubmitUpload}
            isSubmitting={isSubmitting}
            textSubmitting={textSubmitting}
            uploadSubmitting={uploadSubmitting}
            progress={progress}
            error={error}
            onSubmitText={submitText}
            onSubmitUpload={submitUpload}
          />
        ) : route === 'results' ? (
          <ResultsPage
            report={report}
            isExportingPdf={isExportingPdf}
            onExportPdf={exportPdf}
            onOpenScanner={openScanner}
          />
        ) : null}
      </section>

      <Footer appVersion={appVersion} onNavigate={navigateTo} />
    </main>
  );
}
