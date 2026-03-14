import type jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import type { SeverityStyle } from './types';
import { BODY_TEXT, CARD_BG, CARD_BORDER, MUTED_TEXT } from './constants';
import { drawRoundedCard, setFillColor, setTextColor, splitAndClamp } from './primitives';
import { scoreColor, verdictLabel } from './labels';

export function drawVerdictCard(
  doc: jsPDF,
  report: AnalysisReport,
  y: number,
  margin: number,
  contentWidth: number,
  extensionName: string,
  store: string,
  verdictStyle: SeverityStyle
): number {
  const metaW = 134;
  const metaInnerW = metaW - 18;
  const extensionMetaName = splitAndClamp(doc, extensionName, metaInnerW, 2);
  const extensionMetaStore = splitAndClamp(doc, store, metaInnerW, 2);
  const extensionMetaVersion = splitAndClamp(doc, `v${report.metadata.version} (MV${report.metadata.manifestVersion})`, metaInnerW, 2);
  const metaHeight = 14
    + 12 + (extensionMetaName.length * 10) + 8
    + 12 + (extensionMetaStore.length * 10) + 8
    + 12 + (extensionMetaVersion.length * 10) + 12;
  const verdictCardHeight = Math.max(146, metaHeight + 24);

  drawRoundedCard(doc, margin, y, contentWidth, verdictCardHeight, verdictStyle.fill, verdictStyle.border);

  // Score circle
  const scoreX = margin + 50;
  const scoreY = y + 70;
  const scoreRadius = 30;

  setFillColor(doc, scoreColor(report.score.value));
  doc.circle(scoreX, scoreY, scoreRadius, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTextColor(doc, [255, 255, 255]);
  doc.text(String(report.score.value), scoreX, scoreY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('/100', scoreX, scoreY + 16, { align: 'center' });

  // Verdict text
  const verdictTextX = margin + 95;
  const verdictTextW = contentWidth - 250;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, MUTED_TEXT);
  doc.text('OVERALL VERDICT', verdictTextX, y + 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setTextColor(doc, verdictStyle.text);
  doc.text(verdictLabel(report), verdictTextX, y + 47);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setTextColor(doc, BODY_TEXT);
  doc.text(`Risk score ${report.score.value}/100 (${report.score.severity})`, verdictTextX, y + 66);

  doc.setFontSize(10);
  setTextColor(doc, MUTED_TEXT);
  const summaryLines = splitAndClamp(doc, report.summary, verdictTextW, 4);
  doc.text(summaryLines, verdictTextX, y + 84, { lineHeightFactor: 1.15 });

  // Embedded meta card
  const metaX = margin + contentWidth - 148;
  const metaY = y + 12;
  const metaH = verdictCardHeight - 24;

  drawRoundedCard(doc, metaX, metaY, metaW, metaH, CARD_BG, CARD_BORDER);

  let metaCursorY = metaY + 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setTextColor(doc, MUTED_TEXT);
  doc.text('EXTENSION', metaX + 9, metaCursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setTextColor(doc, BODY_TEXT);
  metaCursorY += 12;
  doc.text(extensionMetaName, metaX + 9, metaCursorY, { lineHeightFactor: 1.1 });
  metaCursorY += extensionMetaName.length * 10 + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setTextColor(doc, MUTED_TEXT);
  doc.text('STORE', metaX + 9, metaCursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setTextColor(doc, BODY_TEXT);
  metaCursorY += 12;
  doc.text(extensionMetaStore, metaX + 9, metaCursorY, { lineHeightFactor: 1.1 });
  metaCursorY += extensionMetaStore.length * 10 + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setTextColor(doc, MUTED_TEXT);
  doc.text('VERSION', metaX + 9, metaCursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setTextColor(doc, BODY_TEXT);
  metaCursorY += 12;
  doc.text(extensionMetaVersion, metaX + 9, metaCursorY, { lineHeightFactor: 1.1 });

  return verdictCardHeight;
}
