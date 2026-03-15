import { useMemo, useState } from 'react';
import type { AnalysisReport } from '@extensionchecker/shared';
import type { ResultTab } from '../types';
import { SEVERITY_ORDER } from '../constants';
import { buildPermissionDetails } from '../permission-explainer';
import { resolveExtensionDisplayName } from '../report-display';
import { sourceStoreLabel, sourceListingUrl, sourceStoreBadgeIconSrc } from '../utils/report-source';
import { buildPhases } from '../utils/build-phases';
import { OverviewPanel } from '../components/OverviewPanel';
import { FindingsPanel } from '../components/FindingsPanel';
import { MetadataPanel } from '../components/MetadataPanel';
import { PhasesPanel } from '../components/PhasesPanel';

interface ResultsPageProps {
  report: AnalysisReport | null;
  isExportingPdf: boolean;
  onExportPdf: () => void;
  onOpenScanner: (prefill?: string | null) => void;
  rescanValue?: string | null;
}

export function ResultsPage({ report, isExportingPdf, onExportPdf, onOpenScanner, rescanValue }: ResultsPageProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>('overview');

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
    if (!report) return [];
    return buildPhases(report);
  }, [report]);

  const permissionDetails = useMemo(() => {
    if (!report) {
      return [];
    }

    return buildPermissionDetails(report);
  }, [report]);

  const listingUrl = useMemo(() => (report ? sourceListingUrl(report) : null), [report]);
  const storeBadgeIconSrc = useMemo(() => (report ? sourceStoreBadgeIconSrc(report) : null), [report]);

  if (!report) {
    if (rescanValue) {
      return (
        <section className="results-empty">
          <h2>No Report in Memory</h2>
          <p>This link contains a saved extension reference. Click below to re-run the analysis.</p>
          <p className="results-empty-id"><code>{rescanValue}</code></p>
          <button type="button" className="results-nav-action" onClick={() => onOpenScanner(rescanValue)}>
            Re-scan Extension
          </button>
        </section>
      );
    }

    return (
      <section className="results-empty">
        <h2>No Report Loaded</h2>
        <p>This route is ready for saved report snapshots, but no in-memory report is available yet.</p>
        <button type="button" className="results-nav-action" onClick={() => onOpenScanner()}>Go to Scanner</button>
      </section>
    );
  }

  return (
    <section className="report" aria-live="polite">
      <div className="results-nav">
        <button type="button" className="results-nav-link" onClick={() => onOpenScanner()}>
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
                onClick={onExportPdf}
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
                {storeBadgeIconSrc ? (
                  <img className="extension-identity-store-image" src={storeBadgeIconSrc} alt="" aria-hidden="true" />
                ) : (
                  <span className="material-symbols-outlined" aria-hidden="true">storefront</span>
                )}
                {sourceStoreLabel(report)}
              </a>
            ) : (
              <p className="extension-identity-store">
                {storeBadgeIconSrc ? (
                  <img className="extension-identity-store-image" src={storeBadgeIconSrc} alt="" aria-hidden="true" />
                ) : (
                  <span className="material-symbols-outlined" aria-hidden="true">storefront</span>
                )}
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
          <span className="result-tab-label">Meta</span>
        </button>
        <button
          type="button"
          role="tab"
          id="result-tab-phases"
          aria-selected={activeTab === 'phases'}
          aria-controls="result-panel-phases"
          className={`result-tab ${activeTab === 'phases' ? 'active' : ''}`}
          title="Phases"
          onClick={() => setActiveTab('phases')}
        >
          <span className="material-symbols-outlined" aria-hidden="true">account_tree</span>
          <span className="result-tab-label">Phases</span>
        </button>
      </nav>

      {activeTab === 'overview' ? (
        <OverviewPanel report={report} permissionDetails={permissionDetails} listingUrl={listingUrl} />
      ) : null}

      {activeTab === 'findings' ? (
        <FindingsPanel sortedSignals={sortedSignals} />
      ) : null}

      {activeTab === 'metadata' ? (
        <MetadataPanel report={report} />
      ) : null}

      {activeTab === 'phases' ? (
        <PhasesPanel report={report} phases={phases} />
      ) : null}
    </section>
  );
}
