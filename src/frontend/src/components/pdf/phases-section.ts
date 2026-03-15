import type jsPDF from 'jspdf';
import type { PdfPhaseEntry } from './types';
import { BODY_TEXT, CARD_BG, CARD_BORDER, MUTED_TEXT } from './constants';
import { drawPill, drawRoundedCard, setFillColor, setTextColor, splitText } from './primitives';
import { statusColor } from './labels';

// ── Lite Regex quality badge ────────────────────────────────────────────────

function drawLiteBadge(doc: jsPDF, x: number, y: number): number {
  const label = 'LITE REGEX';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const w = doc.getTextWidth(label) + 10;
  setFillColor(doc, [254, 249, 195]); // amber-100
  doc.roundedRect(x, y, w, 13, 3, 3, 'F');
  setTextColor(doc, [161, 98, 7]); // amber-700
  doc.text(label, x + 5, y + 9.5);
  return w;
}

export function drawPhasesSection(
  doc: jsPDF,
  phases: PdfPhaseEntry[],
  y: number,
  margin: number,
  contentWidth: number
): number {
  const phaseDetailWidth = contentWidth - 180;
  let phaseDynamicHeight = 16;
  for (const phase of phases) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    const detailLines = splitText(doc, phase.detail, phaseDetailWidth);
    phaseDynamicHeight += 18 + (detailLines.length * 11) + 6;
  }
  phaseDynamicHeight += 8;

  drawRoundedCard(doc, margin, y, contentWidth, phaseDynamicHeight, CARD_BG, CARD_BORDER);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setTextColor(doc, BODY_TEXT);
  doc.text('Analysis Pipeline Status', margin + 12, y + 17);

  let phaseY = y + 34;
  for (const phase of phases) {
    const colors     = statusColor(phase.status);
    const badgeLabel = phase.status === 'complete'     ? 'COMPLETE'      :
                       phase.status === 'cached'       ? 'CACHED'        :
                       phase.status === 'partial'      ? 'PARTIAL'       :
                       phase.status === 'unavailable'  ? 'UNAVAILABLE'   : 'NOT AVAILABLE';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, BODY_TEXT);
    doc.text(phase.title, margin + 12, phaseY);

    // Right-side badges (status + optional lite quality indicator).
    let badgeX = margin + contentWidth - 12;
    const statusBadgeW = doc.getTextWidth(badgeLabel) + 14;
    badgeX -= statusBadgeW;
    drawPill(doc, badgeLabel, badgeX, phaseY - 10, colors.fill, colors.text);

    if (phase.scanQuality === 'lite') {
      badgeX -= 6;
      const liteBadgeW = drawLiteBadge(doc, badgeX - (doc.getTextWidth('LITE REGEX') + 10), phaseY - 10);
      badgeX -= liteBadgeW;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    setTextColor(doc, MUTED_TEXT);
    const detailLines = splitText(doc, phase.detail, phaseDetailWidth);
    doc.text(detailLines, margin + 22, phaseY + 12, { lineHeightFactor: 1.2 });

    phaseY += 18 + (detailLines.length * 11) + 6;
  }

  return phaseDynamicHeight;
}

export function drawAnalysisLimitsSection(
  doc: jsPDF,
  notes: readonly string[],
  y: number,
  margin: number,
  contentWidth: number
): number {
  if (notes.length === 0) return 0;

  const noteW = contentWidth - 24;
  let height  = 28;
  for (const note of notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    height += splitText(doc, note, noteW).length * 11 + 4;
  }
  height += 8;

  drawRoundedCard(doc, margin, y, contentWidth, height, [235, 244, 255], [190, 213, 249]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  setTextColor(doc, BODY_TEXT);
  doc.text('Current Analysis Limits', margin + 12, y + 17);

  let limY = y + 30;
  for (const note of notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    setTextColor(doc, MUTED_TEXT);
    const lines = splitText(doc, `\u2022 ${note}`, noteW);
    doc.text(lines, margin + 12, limY);
    limY += lines.length * 11 + 4;
  }

  return height;
}
