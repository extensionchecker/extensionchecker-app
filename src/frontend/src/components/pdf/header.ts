import type jsPDF from 'jspdf';
import { HEADER_BG, HEADER_TEXT } from './constants';
import { drawRoundedCard, setTextColor, splitAndClamp } from './primitives';

export function drawHeader(
  doc: jsPDF,
  y: number,
  contentWidth: number,
  margin: number,
  pageWidth: number,
  extensionName: string,
  version: string,
  manifestVersion: number | string,
  store: string,
  logoDataUrl: string | null
): number {
  const headerHeight = 76;
  drawRoundedCard(doc, margin, y, contentWidth, headerHeight, HEADER_BG, HEADER_BG);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin + 12, y + 12, 24, 24);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setTextColor(doc, HEADER_TEXT);
  const headerTextX = margin + (logoDataUrl ? 44 : 12);
  doc.text('ExtensionChecker Report', headerTextX, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  setTextColor(doc, HEADER_TEXT);
  doc.text(splitAndClamp(doc, extensionName, contentWidth - 200, 1), headerTextX, y + 46);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.2);
  setTextColor(doc, [199, 212, 240]);
  doc.text(`v${version} (MV${manifestVersion}) • ${store}`, headerTextX, y + 61);

  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin - 12, y + 20, { align: 'right' });

  return headerHeight;
}
