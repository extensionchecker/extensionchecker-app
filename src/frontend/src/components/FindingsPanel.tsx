import { useState, useMemo } from 'react';
import type { RiskSignal } from '@extensionchecker/shared';
import { explainSignalImpact } from '../utils/verdict';

type SignalSource = 'manifest' | 'store' | 'code';

const SOURCE_CHIPS: Array<{ key: SignalSource; label: string; icon: string }> = [
  { key: 'manifest', label: 'Manifest', icon: 'description' },
  { key: 'store',    label: 'Store',    icon: 'storefront' },
  { key: 'code',     label: 'Code Scan', icon: 'code' },
];

function signalSource(signal: RiskSignal): SignalSource {
  if (signal.id.startsWith('code-scan-')) return 'code';
  if (signal.id.startsWith('store-')) return 'store';
  return 'manifest';
}

interface FindingsPanelProps {
  sortedSignals: RiskSignal[];
}

export function FindingsPanel({ sortedSignals }: FindingsPanelProps) {
  const [activeFilters, setActiveFilters] = useState(
    () => new Set<SignalSource>(['manifest', 'store', 'code'])
  );

  const counts = useMemo((): Record<SignalSource, number> => {
    const c: Record<SignalSource, number> = { manifest: 0, store: 0, code: 0 };
    for (const s of sortedSignals) c[signalSource(s)]++;
    return c;
  }, [sortedSignals]);

  const visibleSignals = useMemo(
    () => sortedSignals.filter((s) => activeFilters.has(signalSource(s))),
    [sortedSignals, activeFilters]
  );

  function toggleFilter(source: SignalSource): void {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  }

  const isFiltered = visibleSignals.length < sortedSignals.length;

  return (
    <section id="result-panel-findings" role="tabpanel" aria-labelledby="result-tab-findings" className="result-panel">
      <section className="signals">
        <h3>Risk Signals</h3>

        <div className="findings-filters" role="group" aria-label="Filter findings by source">
          {SOURCE_CHIPS.map(({ key, label, icon }) => {
            const count = counts[key];
            const isActive = activeFilters.has(key);
            return (
              <button
                key={key}
                type="button"
                className={`findings-filter-chip${isActive ? '' : ' findings-filter-chip--off'}`}
                aria-pressed={isActive}
                disabled={count === 0}
                onClick={() => toggleFilter(key)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {isActive ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
                {label}
                <span className="findings-filter-count">{count}</span>
              </button>
            );
          })}
        </div>

        {visibleSignals.length === 0 ? (
          <p className="empty-signals">
            {isFiltered
              ? 'No findings match the selected sources.'
              : 'No risk signals were detected.'}
          </p>
        ) : (
          <ul className="signal-list">
            {visibleSignals.map((signal) => (
              <li key={signal.id} className={`signal severity-${signal.severity}`}>
                <div className="signal-header">
                  <strong>
                    <span className={`material-symbols-outlined signal-icon severity-${signal.severity}`} aria-hidden="true">
                      {signal.severity === 'low' ? 'check_circle' : signal.severity === 'medium' ? 'warning' : 'cancel'}
                    </span>
                    {signal.title}
                  </strong>
                  <div className="signal-header-right">
                    <span className={`findings-source-pill findings-source-pill--${signalSource(signal)}`}>
                      {signalSource(signal)}
                    </span>
                    <span className={`severity-pill severity-${signal.severity}`}>{signal.severity}</span>
                  </div>
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
