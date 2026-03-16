/**
 * Reusable score donut ring component.
 * Renders a conic-gradient circle displaying a 0–100 score value.
 * Optionally shows a label below the ring (used for the mini donuts in
 * the composite score layout).
 *
 * variant='capability' (default) - red=high, green=low (access footprint).
 * variant='trust'                - green=high, red=low (store trust signal).
 */

import { scoreColor, scoreBand, trustScoreColor, trustScoreBand } from '../utils/formatting';

interface ScoreDonutProps {
  score: number;
  /** When true, renders the smaller variant used in composite score breakdowns. */
  small?: boolean;
  /** Optional label shown below the donut (e.g. "Capability" or "Store Trust"). */
  label?: string;
  /** Controls colour palette and band labels. Defaults to 'capability'. */
  variant?: 'capability' | 'trust';
  /**
   * When true, renders a greyed-out unavailable ring ("—") instead of a score.
   * Use this when the data source was not available or not applicable.
   */
  unavailable?: boolean;
}

const UNAVAILABLE_COLOR = 'rgba(148, 163, 184, 0.35)';

export function ScoreDonut({ score, small = false, label, variant = 'capability', unavailable = false }: ScoreDonutProps) {
  const color = unavailable ? UNAVAILABLE_COLOR : (variant === 'trust' ? trustScoreColor(score) : scoreColor(score));
  const band  = variant === 'trust' ? trustScoreBand(score)  : scoreBand(score);

  if (small) {
    return (
      <div className="score-donut-wrap">
        <div
          className="score-donut score-donut--small"
          style={{
            ['--score' as string]: unavailable ? 0 : score,
            ['--score-color' as string]: color
          }}
          aria-label={unavailable ? 'Score unavailable' : `Score: ${score} out of 100`}
        >
          <div className="score-donut-inner score-donut-inner--small">
            {unavailable ? (
              <strong style={{ fontSize: '0.7rem', letterSpacing: '0.03em' }}>N/A</strong>
            ) : (
              <>
                <strong>{score}</strong>
                <span>/100</span>
              </>
            )}
          </div>
          {!unavailable && <div className="score-band score-band--small">{band}</div>}
        </div>
        {label ? <p className="score-donut-label">{label}</p> : null}
      </div>
    );
  }

  return (
    <div className="score-donut-wrap">
      <div
        className="score-donut"
        style={{
          ['--score' as string]: score,
          ['--score-color' as string]: color
        }}
        aria-label={`Score: ${score} out of 100`}
      >
        <div className="score-donut-inner">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
        <div className="score-band">{band}</div>
      </div>
      {variant === 'trust' && (
        <p className="score-donut-trust-word">Trust</p>
      )}
    </div>
  );
}
