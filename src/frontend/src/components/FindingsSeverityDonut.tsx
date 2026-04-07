/**\n * Severity breakdown donut for code-scan findings in the Overview panel.\n *\n * Only signals with IDs beginning with \"code-scan-\" are counted \u2014 manifest\n * and store signals are represented by their own donuts. Renders a\n * conic-gradient ring divided into four colour-coded arcs\n * (critical \u2192 high \u2192 medium \u2192 low). The centre value is the total code-scan\n * finding count; the band label shows the deepest observed severity colour.\n * When no code-scan signals exist the ring is grey with a green \u2713.\n */
import type { RiskSignal } from '@extensionchecker/shared';

interface FindingsSeverityDonutProps {
  signals: RiskSignal[];
}

const SEV_COLORS = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#f59e0b',
  low:      '#22c55e',
} as const;

const EMPTY_GRADIENT = `conic-gradient(${SEV_COLORS.low} 360deg)`;

export function FindingsSeverityDonut({ signals }: FindingsSeverityDonutProps) {
  // Only count signals that originated from code scanning — manifest and store
  // signals are already represented by their own donuts.
  const codeSignals = signals.filter((s) => s.id.startsWith('code-scan-'));

  const counts = {
    critical: codeSignals.filter((s) => s.severity === 'critical').length,
    high:     codeSignals.filter((s) => s.severity === 'high').length,
    medium:   codeSignals.filter((s) => s.severity === 'medium').length,
    low:      codeSignals.filter((s) => s.severity === 'low').length,
  };
  const total    = codeSignals.length;

  const ariaLabel =
    total === 0
      ? 'No code scan findings'
      : `Code findings: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low`;

  if (total === 0) {
    return (
      <div className="score-donut-wrap">
        <div
          className="score-donut score-donut--small"
          style={{ background: EMPTY_GRADIENT }}
          aria-label={ariaLabel}
        >
          <div className="score-donut-inner score-donut-inner--small">
            <strong>✓</strong>
          </div>
          <div className="score-band score-band--small">clean</div>
        </div>
        <p className="score-donut-label">Code</p>
      </div>
    );
  }

  // Build conic-gradient in priority order: critical → high → medium → low
  const segments: Array<[string, number]> = [
    [SEV_COLORS.critical, counts.critical],
    [SEV_COLORS.high,     counts.high],
    [SEV_COLORS.medium,   counts.medium],
    [SEV_COLORS.low,      counts.low],
  ];

  const stops: string[] = [];
  let angle = 0;
  for (const [color, count] of segments) {
    if (count === 0) continue;
    const span = (count / total) * 360;
    stops.push(`${color} ${angle.toFixed(2)}deg ${(angle + span).toFixed(2)}deg`);
    angle += span;
  }

  const centerValue = total;
  const bandLabel   = total === 1 ? 'finding' : 'findings';

  return (
    <div className="score-donut-wrap">
      <div
        className="score-donut score-donut--small"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
        aria-label={ariaLabel}
      >
        <div className="score-donut-inner score-donut-inner--small">
          <strong>{centerValue}</strong>
        </div>
        <div className="score-band score-band--small">{bandLabel}</div>
      </div>
      <p className="score-donut-label">Code</p>
    </div>
  );
}
