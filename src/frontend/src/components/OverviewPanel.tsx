import type { AnalysisReport } from '@extensionchecker/shared';
import type { PermissionDetail } from '../permission-explainer';
import { toneForTrustScore, iconForTone } from '../utils/formatting';
import { verdictLabel, verdictExplanation } from '../utils/verdict';
import { overallTrustScore } from '../utils/trust-signal';
import { sourceStoreLabel } from '../utils/report-source';
import { ScoreDonut } from './ScoreDonut';
import { FindingsSeverityDonut } from './FindingsSeverityDonut';
import { AnalysisSignals } from './AnalysisSignals';

interface OverviewPanelProps {
  report: AnalysisReport;
  permissionDetails: PermissionDetail[];
  listingUrl: string | null;
}

export function OverviewPanel({ report, permissionDetails, listingUrl }: OverviewPanelProps) {
  const trustScore = overallTrustScore(report);
  const tone = toneForTrustScore(trustScore);

  // The small capability donut always shows the raw permissions risk.
  const capabilityScore = report.permissionsScore ?? report.score.value;
  // Store donut is always shown. Score is available when store data was fetched
  // (fresh or cached); undefined means the store lookup was not applicable or failed.
  const storeScore =
    (report.scoringBasis === 'manifest-and-store' || report.scoringBasis === 'manifest-and-store-cached')
      ? report.storeTrustScore
      : undefined;

  // Human-readable explanation of what the store signals say (may be null).
  return (
    <section id="result-panel-overview" role="tabpanel" aria-labelledby="result-tab-overview" className="result-panel">
      <div className={`verdict verdict-${tone}`}>
        {/* Row 1: trust headline and brief explanation */}
        <div className="verdict-main">
          <p className="verdict-label">Overall Trust</p>
          <h2>
            <span className={`material-symbols-outlined tone-icon ${tone}`} aria-hidden="true">
              {iconForTone(tone)}
            </span>
            {verdictLabel(report)}
          </h2>
          <p className="verdict-score">
            Trust score <strong>{trustScore}/100</strong>
          </p>
          <p>{verdictExplanation(report)}</p>
        </div>

        {/* Row 2: Manifest · Store · Code donuts feed into the Trust output donut */}
        <div className="verdict-donuts">
          <div className="score-composite" aria-label="Score breakdown">
            <ScoreDonut score={capabilityScore} small label="Manifest" />
            <span className="score-composite-op" aria-hidden="true">+</span>
            <ScoreDonut
              score={storeScore ?? 0}
              small
              label="Store"
              variant="trust"
              unavailable={storeScore === undefined}
            />
            <span className="score-composite-op" aria-hidden="true">+</span>
            <FindingsSeverityDonut signals={report.riskSignals} />
            <span className="score-composite-op" aria-hidden="true">=</span>
            <ScoreDonut score={trustScore} variant="trust" />
          </div>
          <AnalysisSignals report={report} />
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
          <h3>Capability Signals</h3>
          <p>{report.riskSignals.length} signals detected</p>
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
