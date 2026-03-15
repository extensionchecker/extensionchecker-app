import type { AnalysisReport } from '@extensionchecker/shared';
import type { PermissionDetail } from '../permission-explainer';
import { toneForSeverity, iconForTone } from '../utils/formatting';
import { verdictLabel, verdictExplanation, overallScoreContext } from '../utils/verdict';
import { overallTrustScore, trustSignalExplanation } from '../utils/trust-signal';
import { sourceStoreLabel } from '../utils/report-source';
import { ScoreDonut } from './ScoreDonut';
import { AnalysisSignals } from './AnalysisSignals';

interface OverviewPanelProps {
  report: AnalysisReport;
  permissionDetails: PermissionDetail[];
  listingUrl: string | null;
}

export function OverviewPanel({ report, permissionDetails, listingUrl }: OverviewPanelProps) {
  const tone = toneForSeverity(report.score.severity);

  // The small capability donut always shows the raw permissions risk.
  const capabilityScore = report.permissionsScore ?? report.score.value;

  // The big overall donut always shows the overall trust (complement of composite risk).
  const trustScore = overallTrustScore(report);

  // Include the store trust donut when both the scoring basis and score are present.
  const hasStoreTrust =
    report.scoringBasis === 'manifest-and-store' &&
    report.storeTrustScore !== undefined;

  // Human-readable explanation of what the store signals say (may be null).
  const signalNote = trustSignalExplanation(report);

  return (
    <section id="result-panel-overview" role="tabpanel" aria-labelledby="result-tab-overview" className="result-panel">
      <div className={`verdict verdict-${tone}`}>
        {/* Donut column: breakdown on top, analysis signal chips below */}
        <div className="verdict-left">
          <div className="score-composite" aria-label="Score breakdown">
            <ScoreDonut score={capabilityScore} small label="Capability" />
            {hasStoreTrust && (
              <>
                <span className="score-composite-op" aria-hidden="true">+</span>
                <ScoreDonut score={report.storeTrustScore!} small label="Store Trust" variant="trust" />
              </>
            )}
            <span className="score-composite-op" aria-hidden="true">=</span>
            <ScoreDonut score={trustScore} variant="trust" />
          </div>
          <AnalysisSignals report={report} />
        </div>

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
          {signalNote !== null && (
            <p className="verdict-score-context">{signalNote}</p>
          )}
          <p className="verdict-score-context">{overallScoreContext(report)}</p>
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
