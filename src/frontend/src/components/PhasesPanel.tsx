import type { AnalysisReport } from '@extensionchecker/shared';
import type { PhaseStatus } from '../types';
import { phaseTone, phaseIcon, phaseStatusLabel } from '../utils/formatting';

interface Phase {
  id: string;
  title: string;
  status: PhaseStatus;
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
  );
}
