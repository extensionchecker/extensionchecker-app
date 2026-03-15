import type jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import type { SeverityStyle } from './types';
import { BODY_TEXT, CARD_BG, CARD_BORDER, MUTED_TEXT } from './constants';
import { drawRoundedCard, setFillColor, setTextColor, splitAndClamp } from './primitives';
import { trustScoreColorRgb } from './labels';
import { verdictLabel } from '../../utils/verdict';
import { overallTrustScore, trustSignalExplanation } from '../../utils/trust-signal';

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

  // Trust signal explanation (may be null for manifest-only reports).
  const signalNote = trustSignalExplanation(report);
  const signalNoteLines = signalNote !== null
    ? splitAndClamp(doc, signalNote, contentWidth - 250, 2)
    : [];
  const signalNoteHeight = signalNoteLines.length > 0 ? signalNoteLines.length * 11 + 8 : 0;

  const metaHeight = 14
    + 12 + (extensionMetaName.length * 10) + 8
    + 12 + (extensionMetaStore.length * 10) + 8
    + 12 + (extensionMetaVersion.length * 10) + 12;
  // Minimum height: 160 to accommodate circle (y+100) + signals row (y+114) + note (y+124).
  const verdictCardHeight = Math.max(160 + signalNoteHeight, metaHeight + 24);

  drawRoundedCard(doc, margin, y, contentWidth, verdictCardHeight, verdictStyle.fill, verdictStyle.border);

  // Trust score circle — uses inverted colour scale: green = high trust.
  const trustScore = overallTrustScore(report);
  const scoreX = margin + 50;
  const scoreY = y + 70;
  const scoreRadius = 30;

  setFillColor(doc, trustScoreColorRgb(trustScore));
  doc.circle(scoreX, scoreY, scoreRadius, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTextColor(doc, [255, 255, 255]);
  doc.text(String(trustScore), scoreX, scoreY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('/100', scoreX, scoreY + 16, { align: 'center' });

  // Analysis signal indicators: three compact coloured dots + labels below the circle.
  // Drawn as small filled circles (avoids font encoding issues with unicode checkmarks).
  const hasStore = report.scoringBasis === 'manifest-and-store';
  const hasCode = report.limits.codeExecutionAnalysisPerformed;

  const signalDotR = 3.5;
  const signalRowY = scoreY + scoreRadius + 14;
  // When store data is present, label it by source (Firefox Add-ons / AMO).
  // Chrome, Edge, and Opera do not expose public APIs.
  const storeSignalLabel = hasStore ? 'Firefox Add-ons' : 'Store';
  const signals: Array<{ label: string; ok: boolean }> = [
    { label: 'Manifest', ok: true },
    { label: storeSignalLabel, ok: hasStore },
    { label: 'Code', ok: hasCode }
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);

  // Measure total width so we can centre the row under the circle.
  const SIGNAL_GAP = 12;
  const signalWidths = signals.map(({ label }) => signalDotR * 2 + 3 + doc.getTextWidth(label));
  const totalSignalWidth = signalWidths.reduce((a, b) => a + b, 0) + SIGNAL_GAP * (signals.length - 1);
  let sigX = scoreX - totalSignalWidth / 2;

  for (let i = 0; i < signals.length; i++) {
    const { label, ok } = signals[i]!;
    const dotColor: [number, number, number] = ok ? [34, 197, 94] : [148, 163, 184];

    setFillColor(doc, dotColor);
    doc.circle(sigX + signalDotR, signalRowY, signalDotR, 'F');

    setTextColor(doc, ok ? [34, 197, 94] : [148, 163, 184]);
    doc.text(label, sigX + signalDotR * 2 + 3, signalRowY + 2.5);

    sigX += signalWidths[i]! + SIGNAL_GAP;
  }

  // If store data was absent, note which stores have public APIs.
  if (!hasStore) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setTextColor(doc, MUTED_TEXT);
    doc.text('* Store data: Firefox Add-ons only \u2014 Chrome, Edge & Opera have no public API', scoreX, signalRowY + 10, { align: 'center' });
  }

  // Verdict text — label and score come from the shared utility functions.
  const verdictTextX = margin + 95;
  const verdictTextW = contentWidth - 250;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setTextColor(doc, MUTED_TEXT);
  doc.text('OVERALL TRUST', verdictTextX, y + 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setTextColor(doc, verdictStyle.text);
  doc.text(verdictLabel(report), verdictTextX, y + 47);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setTextColor(doc, BODY_TEXT);
  doc.text(`Trust score ${trustScore}/100`, verdictTextX, y + 66);

  doc.setFontSize(10);
  setTextColor(doc, MUTED_TEXT);
  const summaryLines = splitAndClamp(doc, report.summary, verdictTextW, 4);
  doc.text(summaryLines, verdictTextX, y + 84, { lineHeightFactor: 1.15 });

  // Trust signal explanation (e.g. "5.0★ but only 12 users — …").
  if (signalNoteLines.length > 0) {
    const signalNoteY = y + 84 + summaryLines.length * 11 + 8;
    doc.setFontSize(9.5);
    setTextColor(doc, MUTED_TEXT);
    doc.text(signalNoteLines, verdictTextX, signalNoteY, { lineHeightFactor: 1.15 });
  }

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
