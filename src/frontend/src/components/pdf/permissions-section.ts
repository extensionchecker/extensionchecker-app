import type jsPDF from 'jspdf';
import type { PermissionDetail } from '../../permission-explainer';
import { BODY_TEXT, MUTED_TEXT, SEVERITY_STYLES } from './constants';
import { drawPill, drawRoundedCard, setTextColor, splitText, textBlockHeight, drawPageBackground } from './primitives';

function measurePermissionCardHeight(doc: jsPDF, detail: PermissionDetail, w: number): number {
  const titleMaxWidth = w - 180;
  const bodyMaxWidth = w - 24;
  const titleFontSize = 10.2;
  const bodyFontSize = 9.4;
  const lineHeightFactor = 1.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  const titleLines = splitText(doc, detail.permission, titleMaxWidth);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  const explanationLines = splitText(doc, detail.explanation, bodyMaxWidth);
  const dangerLines = splitText(doc, detail.danger, bodyMaxWidth);

  const titleHeight = textBlockHeight(titleLines, titleFontSize, lineHeightFactor);
  const explanationHeight = textBlockHeight(explanationLines, bodyFontSize, lineHeightFactor);
  const dangerHeight = textBlockHeight(dangerLines, bodyFontSize, lineHeightFactor);
  return 26 + titleHeight + explanationHeight + dangerHeight + 14;
}

function drawPermissionCard(doc: jsPDF, detail: PermissionDetail, x: number, y: number, w: number): number {
  const style = SEVERITY_STYLES[detail.severity];
  const titleMaxWidth = w - 180;
  const bodyMaxWidth = w - 24;
  const titleFontSize = 10.2;
  const bodyFontSize = 9.4;
  const lineHeightFactor = 1.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  const titleLines = splitText(doc, detail.permission, titleMaxWidth);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  const explanationLines = splitText(doc, detail.explanation, bodyMaxWidth);
  const dangerLines = splitText(doc, detail.danger, bodyMaxWidth);

  const titleHeight = textBlockHeight(titleLines, titleFontSize, lineHeightFactor);
  const explanationHeight = textBlockHeight(explanationLines, bodyFontSize, lineHeightFactor);
  const dangerHeight = textBlockHeight(dangerLines, bodyFontSize, lineHeightFactor);
  const cardHeight = 26 + titleHeight + explanationHeight + dangerHeight + 14;

  drawRoundedCard(doc, x, y, w, cardHeight, style.fill, style.border);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  setTextColor(doc, style.text);
  doc.text(titleLines, x + 12, y + 16, { lineHeightFactor });

  const sourceLabel = detail.sourceLabel.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const sourceWidth = doc.getTextWidth(sourceLabel) + 14;
  const severityLabel = detail.severity.toUpperCase();
  const severityWidth = doc.getTextWidth(severityLabel) + 14;
  const sourceX = x + w - sourceWidth - 10;
  const severityX = sourceX - severityWidth - 6;

  drawPill(doc, severityLabel, severityX, y + 8, style.pillFill, style.text);
  drawPill(doc, sourceLabel, sourceX, y + 8, [226, 236, 255], [30, 64, 175]);

  let cursorY = y + 24 + titleHeight;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  setTextColor(doc, BODY_TEXT);
  doc.text(explanationLines, x + 12, cursorY, { lineHeightFactor });

  cursorY += explanationHeight + 4;
  setTextColor(doc, MUTED_TEXT);
  doc.text(dangerLines, x + 12, cursorY, { lineHeightFactor });

  return cardHeight;
}

export function drawPermissionsSection(
  doc: jsPDF,
  permissionDetails: PermissionDetail[],
  startY: number,
  margin: number,
  contentWidth: number,
  pageWidth: number,
  pageHeight: number,
  maxY: number
): number {
  let y = startY;

  if (permissionDetails.length === 0) {
    return y;
  }

  const permissionHeaderHeight = 28;
  const firstPermissionHeight = measurePermissionCardHeight(doc, permissionDetails[0]!, contentWidth);

  if (y + permissionHeaderHeight + firstPermissionHeight > maxY) {
    doc.addPage();
    drawPageBackground(doc, pageWidth, pageHeight);
    y = margin;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setTextColor(doc, BODY_TEXT);
  doc.text('Declared Permissions and Access', margin, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.3);
  setTextColor(doc, MUTED_TEXT);
  doc.text('Permissions are sorted from highest potential impact to lowest.', margin, y + 24);
  y += 30;

  for (const detail of permissionDetails) {
    const cardHeight = measurePermissionCardHeight(doc, detail, contentWidth);
    if (y + cardHeight > maxY) {
      doc.addPage();
      drawPageBackground(doc, pageWidth, pageHeight);
      y = margin;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      setTextColor(doc, BODY_TEXT);
      doc.text('Declared Permissions and Access (continued)', margin, y + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.3);
      setTextColor(doc, MUTED_TEXT);
      doc.text('Permissions are sorted from highest potential impact to lowest.', margin, y + 24);
      y += 30;
    }

    y += drawPermissionCard(doc, detail, margin, y, contentWidth) + 6;
  }

  return y;
}
