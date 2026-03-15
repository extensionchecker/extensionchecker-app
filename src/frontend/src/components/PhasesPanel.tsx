import type { AnalysisReport } from '@extensionchecker/shared';
import type { PhaseStatus } from '../types';
import { phaseTone, phaseIcon, phaseStatusLabel } from '../utils/formatting';

interface Phase {
  id: string;
  title: string;
  status: PhaseStatus;
  /** When present, distinguishes lite regex scanning from a full AST scan. */
  scanQuality?: 'lite' | 'full';
  detail: string;
}

interface PhasesPanelProps {
  report: AnalysisReport;
  phases: Phase[];
}

export function PhasesPanel({ report, phases }: PhasesPanelProps) {
  return (
    <section id="result-panel-phases" role="tabpanel" aria-labelledby="result-tab-phases" className="result-panel">
      <section className="phase-list-section">
        <h3>Analysis Pipeline Status</h3>
        <ul className="phase-list">
          {phases.map((phase) => (
            <li key={phase.id} className={`phase-card ${phase.status}${phase.scanQuality === 'lite' ? ' phase-card--lite' : ''}`}>
              <div className="phase-head">
                <strong>
                  <span className={`material-symbols-outlined tone-icon ${phaseTone(phase.status)}`} aria-hidden="true">
                    {phaseIcon(phase.status)}
                  </span>
                  {phase.title}
                </strong>
                <div className="phase-head-badges">
                  {phase.scanQuality === 'lite' && (
                    <span className="phase-quality-badge" title="Lite pattern-based regex scan — not a full AST analysis">
                      <span className="material-symbols-outlined" aria-hidden="true">flash_on</span>
                      Lite Regex
                    </span>
                  )}
                  <span className={`phase-status ${phase.status}`}>{phaseStatusLabel(phase.status)}</span>
                </div>
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
  );
}
