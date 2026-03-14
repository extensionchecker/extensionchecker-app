import type { RiskSignal } from '@extensionchecker/shared';
import { explainSignalImpact } from '../utils/verdict';

interface FindingsPanelProps {
  sortedSignals: RiskSignal[];
}

export function FindingsPanel({ sortedSignals }: FindingsPanelProps) {
  return (
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
  );
}
