import type jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import { BODY_TEXT, CARD_BG, CARD_BORDER, MUTED_TEXT } from './constants';
import { drawRoundedCard, setDrawColor, setTextColor, splitAndClamp } from './primitives';

export function drawSmallMetricCard(doc: jsPDF, x: number, y: number, w: number, h: number, title: string, lines: string[]): void {
  drawRoundedCard(doc, x, y, w, h, CARD_BG, CARD_BORDER);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setTextColor(doc, MUTED_TEXT);
  doc.text(title.toUpperCase(), x + 10, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setTextColor(doc, BODY_TEXT);

  let lineY = y + 28;
  const maxTextWidth = w - 20;
  for (const line of lines) {
    const chunks = splitAndClamp(doc, line, maxTextWidth, 2);
    doc.text(chunks, x + 10, lineY);
    lineY += chunks.length * 11 + 2;
  }
}

export function drawStoreMetricCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  store: string,
  source: AnalysisReport['source']
): void {
  drawRoundedCard(doc, x, y, w, h, CARD_BG, CARD_BORDER);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setTextColor(doc, MUTED_TEXT);
  doc.text('STORE', x + 10, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setTextColor(doc, BODY_TEXT);

  let lineY = y + 28;
  const maxTextWidth = w - 20;
  const storeLine = splitAndClamp(doc, store, maxTextWidth, 1);
  doc.text(storeLine, x + 10, lineY);
  lineY += 13;

  if (source.type === 'url') {
    const linkLabel = 'Link to Extension';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.6);
    setTextColor(doc, [29, 78, 216]);
    const linkWidth = doc.textWithLink(linkLabel, x + 10, lineY, { url: source.value });
    setDrawColor(doc, [29, 78, 216]);
    doc.setLineWidth(0.7);
    doc.line(x + 10, lineY + 1.8, x + 10 + linkWidth, lineY + 1.8);
    doc.setLineWidth(0.2);
    return;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.2);
  setTextColor(doc, MUTED_TEXT);
  const detail = source.type === 'file' ? source.filename : source.value;
  const detailLines = splitAndClamp(doc, detail, maxTextWidth, 2);
  doc.text(detailLines, x + 10, lineY, { lineHeightFactor: 1.15 });
}

export function drawMetricRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentWidth: number,
  store: string,
  source: AnalysisReport['source'],
  report: AnalysisReport
): number {
  const gap = 8;
  const metricWidth = (contentWidth - (gap * 2)) / 3;
  const metricHeight = 92;

  drawStoreMetricCard(doc, margin, y, metricWidth, metricHeight, store, source);
  drawSmallMetricCard(
    doc,
    margin + metricWidth + gap,
    y,
    metricWidth,
    metricHeight,
    'Permissions',
    [
      `${report.permissions.requestedPermissions.length} requested`,
      `${report.permissions.optionalPermissions.length} optional`,
      `${report.permissions.hostPermissions.length} host scopes`
    ]
  );
  drawSmallMetricCard(doc, margin + ((metricWidth + gap) * 2), y, metricWidth, metricHeight, 'Signals', [`${report.riskSignals.length} total findings`, `Top severity: ${report.score.severity}`]);

  return metricHeight;
}
