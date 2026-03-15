/**
 * Draws the "Manifest + [Store] + Code = Trust" composite donut row shown at
 * the bottom of the PDF verdict card. Mirrors the ScoreDonut / FindingsSeverityDonut
 * composite layout from the website's Overview tab.
 */
import type jsPDF from 'jspdf';
import type { AnalysisReport, RiskSignal } from '@extensionchecker/shared';
import type { RGB } from './types';
import { BODY_TEXT, DONUT_BG_RING, MUTED_TEXT } from './constants';
import {
  drawScoreDonutRing,
  drawFindingsDonutRing,
  setTextColor,
} from './primitives';
import { trustScoreColorRgb, scoreColor as scoreColorRgb } from './labels';
import { overallTrustScore } from '../../utils/trust-signal';
import { scoreBand, trustScoreBand } from '../../utils/formatting';

// ── Layout constants ─────────────────────────────────────────────────────────

const SMALL_OUTER_R = 23;  // small donuts (Manifest, Store, Code)
const SMALL_INNER_R = 14;
const LARGE_OUTER_R = 36;  // Trust donut — visually dominant, matches website
const LARGE_INNER_R = 22;
const DONUT_GAP     = 14;  // horizontal space between donut edge and next element
const OP_WIDTH      = 18;  // width reserved for "+" / "=" operators

// ── Severity colour mapping for code-scan findings ───────────────────────────

const SEV_COLORS: Record<string, RGB> = {
  critical: [220, 38, 38],
  high:     [234, 88, 12],
  medium:   [245, 158, 11],
  low:      [34, 197, 94],
};

// ── Internal helpers ─────────────────────────────────────────────────────────

function buildCodeDonutSegments(
  signals: RiskSignal[],
): ReadonlyArray<{ fraction: number; color: RGB }> {
  const codeSignals = signals.filter((s) => s.id.startsWith('code-scan-'));
  const total = codeSignals.length;

  if (total === 0) return [];

  const counts = {
    critical: codeSignals.filter((s) => s.severity === 'critical').length,
    high:     codeSignals.filter((s) => s.severity === 'high').length,
    medium:   codeSignals.filter((s) => s.severity === 'medium').length,
    low:      codeSignals.filter((s) => s.severity === 'low').length,
  };

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([sev, count]) => ({
      fraction: count / total,
      color:    SEV_COLORS[sev] ?? ([34, 197, 94] as RGB),
    }));
}

// ── DonutItem union used only for the render loop ────────────────────────────

type DonutItem =
  | { kind: 'score'; score: number; variant: 'capability' | 'trust'; label: string }
  | { kind: 'code' }
  | { kind: 'op'; symbol: string };

// ── Public draw function ─────────────────────────────────────────────────────

/**
 * Draws the "Manifest + [Store] + Code = Trust" composite donut row.
 *
 * @param y                - Top of the verdict card (same `y` passed to drawVerdictCard).
 * @param upperSectionHeight - Height of the upper portion of the card (trust circle + text + meta).
 * @param metaCardWidth    - Width of the right-side meta card (used to compute available row width).
 * @param verdictFill      - Card background colour used as the donut hole fill.
 */
export function drawCompositeScoreRow(
  doc: jsPDF,
  report: AnalysisReport,
  y: number,
  upperSectionHeight: number,
  margin: number,
  contentWidth: number,
  verdictFill: RGB,
): void {
  const trustScore      = overallTrustScore(report);
  const capabilityScore = report.permissionsScore ?? report.score.value;
  const hasStoreTrust   = report.scoringBasis === 'manifest-and-store' && report.storeTrustScore !== undefined;

  const codeSegments    = buildCodeDonutSegments(report.riskSignals);
  const codeSignalCount = report.riskSignals.filter((s) => s.id.startsWith('code-scan-')).length;

  const rowCenterY = y + upperSectionHeight + 14 + LARGE_OUTER_R;

  const items: DonutItem[] = [];
  items.push({ kind: 'score', score: capabilityScore, variant: 'capability', label: 'Manifest' });
  if (hasStoreTrust) {
    items.push({ kind: 'op', symbol: '+' });
    items.push({ kind: 'score', score: report.storeTrustScore!, variant: 'trust', label: 'Store' });
  }
  items.push({ kind: 'op', symbol: '+' });
  items.push({ kind: 'code' });
  items.push({ kind: 'op', symbol: '=' });
  items.push({ kind: 'score', score: trustScore, variant: 'trust', label: 'Trust' });

  // Measure total row width to centre it within the full card width.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  let totalRowW = 0;
  for (const item of items) {
    if (item.kind === 'op')                                          totalRowW += OP_WIDTH + DONUT_GAP * 2;
    else if (item.kind === 'score' && item.label === 'Trust')        totalRowW += LARGE_OUTER_R * 2 + DONUT_GAP;
    else                                                             totalRowW += SMALL_OUTER_R * 2 + DONUT_GAP;
  }

  // Centre the row across the full card width.
  const availableW = contentWidth;
  let donutX = margin + (availableW - totalRowW) / 2 + SMALL_OUTER_R;

  setTextColor(doc, BODY_TEXT);

  for (const item of items) {
    if (item.kind === 'op') {
      doc.text(item.symbol, donutX, rowCenterY + 4, { align: 'center' });
      donutX += OP_WIDTH + DONUT_GAP * 2;
      continue;
    }

    if (item.kind === 'code') {
      const cleanColor: RGB = [34, 197, 94];
      drawFindingsDonutRing(
        doc, donutX, rowCenterY, SMALL_OUTER_R, SMALL_INNER_R,
        codeSegments, cleanColor, verdictFill,
      );

      doc.setFont('helvetica', 'bold');
      setTextColor(doc, [25, 33, 49]);
      if (codeSignalCount === 0) {
        doc.setFontSize(12);
        doc.text('✓', donutX, rowCenterY + 4, { align: 'center' });
      } else {
        doc.setFontSize(codeSignalCount > 9 ? 9 : 12);
        doc.text(String(codeSignalCount), donutX, rowCenterY - 1, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5);
        doc.text('FINDINGS', donutX, rowCenterY + 8, { align: 'center' });
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setTextColor(doc, MUTED_TEXT);
      doc.text('CODE', donutX, rowCenterY + SMALL_OUTER_R + 12, { align: 'center' });

      donutX += SMALL_OUTER_R + SMALL_OUTER_R + DONUT_GAP;
      continue;
    }

    // score donut
    const isLarge   = item.label === 'Trust';
    const outerR    = isLarge ? LARGE_OUTER_R : SMALL_OUTER_R;
    const innerR    = isLarge ? LARGE_INNER_R : SMALL_INNER_R;
    const ringColor = item.variant === 'trust'
      ? trustScoreColorRgb(item.score)
      : scoreColorRgb(item.score);

    drawScoreDonutRing(
      doc, donutX, rowCenterY, outerR, innerR,
      item.score / 100, ringColor, DONUT_BG_RING, verdictFill,
    );

    const band = item.variant === 'trust' ? trustScoreBand(item.score) : scoreBand(item.score);

    // Score number shifted up to leave room for band label inside the hole
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isLarge ? 14 : 11);
    setTextColor(doc, [25, 33, 49]);
    doc.text(String(item.score), donutX, rowCenterY - 3, { align: 'center' });
    // /100
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isLarge ? 7.5 : 6);
    doc.text('/100', donutX, rowCenterY - 3 + (isLarge ? 8 : 6.5), { align: 'center' });
    // Band label at bottom of hole
    doc.setFontSize(isLarge ? 6 : 5);
    doc.text(band.toUpperCase(), donutX, rowCenterY + (isLarge ? 13 : 10), { align: 'center' });

    // Label below donut ring (UPPERCASE to match website)
    doc.setFont('helvetica', isLarge ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    setTextColor(doc, isLarge ? BODY_TEXT : MUTED_TEXT);
    doc.text(item.label.toUpperCase(), donutX, rowCenterY + outerR + 12, { align: 'center' });

    donutX += outerR + (isLarge ? LARGE_OUTER_R : SMALL_OUTER_R) + DONUT_GAP;
  }
}
