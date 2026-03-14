import type jsPDF from 'jspdf';
import type { RiskSignal } from '@extensionchecker/shared';
import { BODY_TEXT, MUTED_TEXT, SEVERITY_STYLES } from './constants';
import { drawPill, drawRoundedCard, setFillColor, setTextColor, splitText, textBlockHeight, drawPageBackground } from './primitives';

function startFindingsSection(doc: jsPDF, title: string, margin: number, startY: number): number {
  const titleY = startY + 12;
  const subtitleY = startY + 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, BODY_TEXT);
  doc.text(title, margin, titleY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.3);
  setTextColor(doc, MUTED_TEXT);
  doc.text('Sorted by severity and score impact.', margin, subtitleY);

  return startY + 30;
}

function measureFindingCardHeight(doc: jsPDF, finding: RiskSignal, w: number): number {
  const titleMaxWidth = w - 140;
  const descMaxWidth = w - 24;
  const titleFontSize = 10.2;
  const descFontSize = 9.5;
  const lineHeightFactor = 1.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  const titleLines = splitText(doc, finding.title, titleMaxWidth);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(descFontSize);
  const descLines = splitText(doc, finding.description, descMaxWidth);

  const titleHeight = textBlockHeight(titleLines, titleFontSize, lineHeightFactor);
  const descHeight = textBlockHeight(descLines, descFontSize, lineHeightFactor);
  return 18 + titleHeight + descHeight + 12;
}

function drawFindingCard(doc: jsPDF, finding: RiskSignal, x: number, y: number, w: number): number {
  const style = SEVERITY_STYLES[finding.severity];
  const titleMaxWidth = w - 140;
  const descMaxWidth = w - 24;
  const titleFontSize = 10.2;
  const descFontSize = 9.5;
  const lineHeightFactor = 1.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  const titleLines = splitText(doc, finding.title, titleMaxWidth);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(descFontSize);
  const descLines = splitText(doc, finding.description, descMaxWidth);

  const titleHeight = textBlockHeight(titleLines, titleFontSize, lineHeightFactor);
  const descHeight = textBlockHeight(descLines, descFontSize, lineHeightFactor);
  const cardHeight = 18 + titleHeight + descHeight + 12;

  drawRoundedCard(doc, x, y, w, cardHeight, style.fill, style.border);

  setFillColor(doc, style.border);
  doc.circle(x + 12, y + 14, 3.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  setTextColor(doc, style.text);
  doc.text(titleLines, x + 21, y + 17, { lineHeightFactor });

  const pillLabel = finding.severity.toUpperCase();
  const pillWidth = doc.getTextWidth(pillLabel) + 14;
  drawPill(doc, pillLabel, x + w - pillWidth - 10, y + 8, style.pillFill, style.text);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(descFontSize);
  setTextColor(doc, BODY_TEXT);
  doc.text(descLines, x + 12, y + 21 + titleHeight, { lineHeightFactor });

  return cardHeight;
}

export function drawFindingsSection(
  doc: jsPDF,
  findings: RiskSignal[],
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  maxY: number
): number {
  let y = startY;

  if (findings.length === 0) {
    if (y + 44 > maxY) {
      doc.addPage();
      drawPageBackground(doc, pageWidth, pageHeight);
      y = margin;
    }
    y = startFindingsSection(doc, 'Key Findings', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    setTextColor(doc, MUTED_TEXT);
    doc.text('No risk findings were detected for this extension in manifest analysis.', margin, y + 16);
    return y + 16;
  }

  const findingsHeaderHeight = 30;
  const firstCardHeight = measureFindingCardHeight(doc, findings[0]!, contentWidth);

  if (y + findingsHeaderHeight + firstCardHeight > maxY) {
    doc.addPage();
    drawPageBackground(doc, pageWidth, pageHeight);
    y = margin;
  }

  y = startFindingsSection(doc, 'Key Findings', margin, y);

  for (const finding of findings) {
    const cardHeight = measureFindingCardHeight(doc, finding, contentWidth);

    if (y + cardHeight > maxY) {
      doc.addPage();
      drawPageBackground(doc, pageWidth, pageHeight);
      y = startFindingsSection(doc, 'Key Findings (continued)', margin, margin);
    }

    const renderedHeight = drawFindingCard(doc, finding, margin, y, contentWidth);
    y += renderedHeight + 6;
  }

  return y;
}
