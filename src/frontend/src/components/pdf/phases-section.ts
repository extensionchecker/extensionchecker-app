import type jsPDF from 'jspdf';
import type { PhaseEntry } from './types';
import { BODY_TEXT, CARD_BG, CARD_BORDER, MUTED_TEXT } from './constants';
import { drawPill, drawRoundedCard, setTextColor, splitText } from './primitives';
import { statusColor } from './labels';

export function drawPhasesSection(
  doc: jsPDF,
  phases: PhaseEntry[],
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
  doc.text('Analysis Phases', margin + 12, y + 17);

  let phaseY = y + 34;
  for (const phase of phases) {
    const colors = statusColor(phase.status);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setTextColor(doc, BODY_TEXT);
    doc.text(phase.title, margin + 12, phaseY);

    const badgeLabel = phase.status.toUpperCase();
    const badgeWidth = doc.getTextWidth(badgeLabel) + 14;
    drawPill(doc, badgeLabel, margin + contentWidth - badgeWidth - 12, phaseY - 10, colors.fill, colors.text);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    setTextColor(doc, MUTED_TEXT);
    const detailLines = splitText(doc, phase.detail, phaseDetailWidth);
    doc.text(detailLines, margin + 22, phaseY + 12, { lineHeightFactor: 1.2 });

    phaseY += 18 + (detailLines.length * 11) + 6;
  }

  return phaseDynamicHeight;
}
