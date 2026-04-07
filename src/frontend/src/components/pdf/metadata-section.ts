/**
 * PDF section rendering the Metadata tab content.
 * Mirrors MetadataPanel.tsx — package details, developer information,
 * store & source data, and extension description.
 */
import type jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import { BODY_TEXT, CARD_BG, CARD_BORDER, MUTED_TEXT } from './constants';
import { drawRoundedCard, setTextColor, splitText, textBlockHeight, drawPageBackground } from './primitives';
import { sourceStoreLabel } from '../../utils/report-source';

// ── Internal helpers ────────────────────────────────────────────────────────

const COL_W_RATIO = 0.5; // each of 2 columns is half the content width

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Draws a definition-list style metadata card and returns the card height. */
function drawMetadataCard(
  doc: jsPDF,
  heading: string,
  rows: ReadonlyArray<readonly [string, string]>,
  x: number,
  y: number,
  w: number
): number {
  const headingFontSize = 9;
  const labelFontSize   = 8.5;
  const valueFontSize   = 9.5;
  const innerW          = w - 20;
  const sectionGap      = 6;

  let height = 22; // top padding + heading

  for (const [, value] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(valueFontSize);
    const valueLines = splitText(doc, value, innerW);
    height += 14 + textBlockHeight(valueLines, valueFontSize, 1.15) + sectionGap;
  }
  height += 8;

  drawRoundedCard(doc, x, y, w, height, CARD_BG, CARD_BORDER);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(headingFontSize);
  setTextColor(doc, MUTED_TEXT);
  doc.text(heading.toUpperCase(), x + 10, y + 15);

  let cursorY = y + 24;
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(labelFontSize);
    setTextColor(doc, MUTED_TEXT);
    doc.text(label, x + 10, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(valueFontSize);
    setTextColor(doc, BODY_TEXT);
    cursorY += 10;
    const valueLines = splitText(doc, value, innerW);
    doc.text(valueLines, x + 10, cursorY, { lineHeightFactor: 1.15 });
    cursorY += textBlockHeight(valueLines, valueFontSize, 1.15) + sectionGap;
  }

  return height;
}

function drawFullWidthDescriptionCard(
  doc: jsPDF,
  description: string,
  x: number,
  y: number,
  w: number
): number {
  const innerW     = w - 20;
  const bodyFontSize = 9.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  const descLines = splitText(doc, description, innerW);
  const cardHeight = 28 + textBlockHeight(descLines, bodyFontSize, 1.2) + 8;

  drawRoundedCard(doc, x, y, w, cardHeight, CARD_BG, CARD_BORDER);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setTextColor(doc, MUTED_TEXT);
  doc.text('DESCRIPTION', x + 10, y + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  setTextColor(doc, BODY_TEXT);
  doc.text(descLines, x + 10, y + 27, { lineHeightFactor: 1.2 });

  return cardHeight;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function drawMetadataSection(
  doc: jsPDF,
  report: AnalysisReport,
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  maxY: number
): number {
  let y = startY;

  // Section heading.
  const headerNeeded = 28;
  if (y + headerNeeded > maxY) {
    doc.addPage();
    drawPageBackground(doc, pageWidth, pageHeight);
    y = margin;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, BODY_TEXT);
  doc.text('Extension Metadata', margin, y + 12);
  y += 22;

  // ── Package details ────────────────────────────────────────────────────
  const packageRows: Array<readonly [string, string]> = [
    ['Extension Name', report.metadata.name],
    ['Version',        report.metadata.version],
    ['Manifest',       `MV${report.metadata.manifestVersion}`],
  ];
  if (report.storeMetadata?.shortName) {
    packageRows.push(['Short Name', report.storeMetadata.shortName]);
  }
  if (report.storeMetadata?.packageSizeBytes) {
    packageRows.push(['Package Size', formatBytes(report.storeMetadata.packageSizeBytes)]);
  }

  // ── Store & source details ─────────────────────────────────────────────
  const storeRows: Array<readonly [string, string]> = [
    ['Source', sourceStoreLabel(report)],
  ];
  if (report.storeMetadata?.category)    storeRows.push(['Category',     report.storeMetadata.category]);
  if (report.storeMetadata?.rating !== undefined) {
    const ratingText = `${report.storeMetadata.rating.toFixed(1)} / 5${
      report.storeMetadata.ratingCount !== undefined
        ? ` (${report.storeMetadata.ratingCount.toLocaleString()} ratings)`
        : ''}`;
    storeRows.push(['Rating', ratingText]);
  }
  if (report.storeMetadata?.userCount !== undefined) {
    storeRows.push(['Users', report.storeMetadata.userCount.toLocaleString()]);
  }
  if (report.storeMetadata?.lastUpdated) {
    storeRows.push(['Last Updated', report.storeMetadata.lastUpdated]);
  }

  // ── Developer details ──────────────────────────────────────────────────
  const devRows: Array<readonly [string, string]> = [];
  if (report.storeMetadata?.author)        devRows.push(['Author',    report.storeMetadata.author]);
  if (report.storeMetadata?.developerName) devRows.push(['Developer', report.storeMetadata.developerName]);
  if (report.storeMetadata?.developerUrl)  devRows.push(['Dev Site',  report.storeMetadata.developerUrl]);
  if (report.storeMetadata?.homepageUrl)   devRows.push(['Homepage',  report.storeMetadata.homepageUrl]);

  // ── Draw two-column card row ───────────────────────────────────────────
  const gap    = 8;
  const colW   = (contentWidth - gap) * COL_W_RATIO;

  // Measure column card heights to derive row height.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);

  let leftRows  = [...packageRows];
  let rightRows = storeRows.length > 0 ? [...storeRows] : [...devRows];
  let thirdRows = storeRows.length > 0 && devRows.length > 0 ? [...devRows] : null;

  // If all three groups fit in two columns, merge package + dev into left col.
  const leftCard  = () => drawMetadataCard(doc, 'Package Details', leftRows, margin, y, colW);
  const rightCard = () => drawMetadataCard(doc, storeRows.length > 0 ? 'Store & Source' : 'Developer', rightRows, margin + colW + gap, y, colW);

  const estimatedH = Math.max(
    22 + leftRows.length * 22,
    22 + rightRows.length * 22
  );

  if (y + estimatedH > maxY) {
    doc.addPage();
    drawPageBackground(doc, pageWidth, pageHeight);
    y = margin;
  }

  const leftH  = leftCard();
  const rightH = rightCard();
  y += Math.max(leftH, rightH) + gap;

  // Third card (developer info) if stores + dev both have data.
  if (thirdRows !== null && thirdRows.length > 0) {
    const devH = 22 + thirdRows.length * 22;
    if (y + devH > maxY) {
      doc.addPage();
      drawPageBackground(doc, pageWidth, pageHeight);
      y = margin;
    }
    y += drawMetadataCard(doc, 'Developer', thirdRows, margin, y, contentWidth) + gap;
  }

  // ── Description card (full-width) ─────────────────────────────────────
  if (report.storeMetadata?.description) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const descLines = splitText(doc, report.storeMetadata.description, contentWidth - 20);
    const descCardH = 28 + textBlockHeight(descLines, 9.5, 1.2) + 8;

    if (y + descCardH > maxY) {
      doc.addPage();
      drawPageBackground(doc, pageWidth, pageHeight);
      y = margin;
    }

    y += drawFullWidthDescriptionCard(doc, report.storeMetadata.description, margin, y, contentWidth) + gap;
  }

  return y;
}
