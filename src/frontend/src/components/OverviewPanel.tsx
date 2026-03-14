import type { AnalysisReport } from '@extensionchecker/shared';
import type { PermissionDetail } from '../permission-explainer';
import { toneForSeverity, scoreColor, scoreBand, iconForTone } from '../utils/formatting';
import { verdictLabel, verdictExplanation } from '../utils/verdict';
import { sourceStoreLabel } from '../utils/report-source';

interface OverviewPanelProps {
  report: AnalysisReport;
  permissionDetails: PermissionDetail[];
  listingUrl: string | null;
}

export function OverviewPanel({ report, permissionDetails, listingUrl }: OverviewPanelProps) {
  return (
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
  );
}
