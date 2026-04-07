import type jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import type { RGB, SeverityStyle } from './types';
import { BODY_TEXT, MUTED_TEXT } from './constants';
import { drawRoundedCard, setFillColor, setTextColor, splitAndClamp } from './primitives';
import { verdictLabel } from '../../utils/verdict';
import { overallTrustScore, trustSignalExplanation } from '../../utils/trust-signal';
import { deriveAnalysisSignalState } from '../../utils/analysis-signal-state';
import type { SignalVariant } from '../../utils/analysis-signal-state';
import { drawCompositeScoreRow } from './composite-score-row';

// ── Signal chip colour mapping ───────────────────────────────────────────────

function signalChipColors(variant: SignalVariant): { fill: RGB; text: RGB } {
  if (variant === 'ok')      return { fill: [214, 243, 222], text: [26, 110, 51]  };
  if (variant === 'cached')  return { fill: [219, 234, 254], text: [37, 99, 235]  };
  if (variant === 'error')   return { fill: [255, 232, 232], text: [141, 36, 36]  };
  if (variant === 'partial') return { fill: [255, 234, 194], text: [132, 85, 21]  };
  return                            { fill: [241, 245, 249], text: [71, 85, 105]  };
}

export function drawVerdictCard(
  doc: jsPDF,
  report: AnalysisReport,
  y: number,
  margin: number,
  contentWidth: number,
  _extensionName: string,
  _store: string,
  verdictStyle: SeverityStyle
): number {
  const trustScore = overallTrustScore(report);

  // jsPDF's built-in Helvetica uses WinAnsi encoding, which does not include
  // the ★ (U+2605) glyph. Replace it with "/5" before handing text to jsPDF
  // to avoid glyph substitution that corrupts both the character and the
  // surrounding letter-spacing.
  const signalNote      = trustSignalExplanation(report)?.replace(/★/g, '/5') ?? null;
  const signalNoteLines = signalNote !== null
    ? splitAndClamp(doc, signalNote, contentWidth - 28, 2)
    : [];
  const signalNoteHeight = signalNoteLines.length > 0 ? signalNoteLines.length * 11 + 8 : 0;

  // Upper section = OVERALL TRUST label + verdict name + trust score line +
  // summary paragraph + optional signal note, with a minimum for breathing room.
  const TEXT_TOP_PAD = 16;
  const verdictNameH = 28; // font 20 + gap
  const trustScoreH  = 18;
  const summaryLines = splitAndClamp(doc, report.summary, contentWidth - 28, 4);
  const summaryH     = summaryLines.length * 12;
  const upperSectionHeight = Math.max(
    TEXT_TOP_PAD + 14 + verdictNameH + trustScoreH + summaryH + signalNoteHeight + 16,
    120,
  );

  const COMPOSITE_ROW_H = 100; // large donut diameter (72) + label (12) + padding
  const SIGNAL_CHIPS_H  = 28;
  const verdictCardHeight = upperSectionHeight + COMPOSITE_ROW_H + SIGNAL_CHIPS_H;

  drawRoundedCard(doc, margin, y, contentWidth, verdictCardHeight, verdictStyle.fill, verdictStyle.border);

  // ── Verdict text block (full width, flush left) ───────────────────────────
  const textX = margin + 14;
  let   textY = y + TEXT_TOP_PAD;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setTextColor(doc, MUTED_TEXT);
  doc.text('OVERALL TRUST', textX, textY + 9);
  textY += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setTextColor(doc, verdictStyle.text);
  doc.text(verdictLabel(report), textX, textY + 20);
  textY += verdictNameH;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, BODY_TEXT);
  doc.text(`Trust score ${trustScore}/100`, textX, textY + 12);
  textY += trustScoreH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setTextColor(doc, MUTED_TEXT);
  doc.text(summaryLines, textX, textY + 11, { lineHeightFactor: 1.2 });
  textY += summaryH;

  if (signalNoteLines.length > 0) {
    doc.setFontSize(9);
    doc.text(signalNoteLines, textX, textY + 13, { lineHeightFactor: 1.2 });
  }

  // ── Composite score donut row (below text, full card width) ─────────────
  drawCompositeScoreRow(
    doc, report, y, upperSectionHeight, margin, contentWidth, verdictStyle.fill,
  );

  // ── Analysis signal chips (centred below composite row) ──────────────────
  const signalState   = deriveAnalysisSignalState(report);
  const chipsData: Array<{ label: string; variant: SignalVariant }> = [
    { label: 'Manifest',             variant: 'ok'                      },
    { label: signalState.storeLabel, variant: signalState.storeVariant  },
    { label: signalState.codeLabel,  variant: signalState.codeVariant   },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);

  const chipPadX   = 7;
  const chipH      = 13;
  const chipGap    = 6;
  const chipWidths = chipsData.map(({ label }) => doc.getTextWidth(label) + chipPadX * 2);
  const totalChipW = chipWidths.reduce((a, b) => a + b, 0) + chipGap * (chipsData.length - 1);

  const chipsY = y + upperSectionHeight + COMPOSITE_ROW_H + 7;
  let chipX    = margin + (contentWidth - totalChipW) / 2;

  for (let i = 0; i < chipsData.length; i++) {
    const { label, variant } = chipsData[i]!;
    const { fill, text }     = signalChipColors(variant);
    const w                  = chipWidths[i]!;
    setFillColor(doc, fill);
    doc.roundedRect(chipX, chipsY, w, chipH, 6, 6, 'F');
    setTextColor(doc, text);
    doc.text(label, chipX + chipPadX, chipsY + 9);
    chipX += w + chipGap;
  }

  if (signalState.storeHasNote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setTextColor(doc, MUTED_TEXT);
    doc.text(
      'Store: Firefox Add-ons only — Chrome, Edge & Opera have no public API',
      margin + contentWidth / 2, chipsY + chipH + 7, { align: 'center' }
    );
  }

  return verdictCardHeight;
}
