import type jsPDF from 'jspdf';
import type { RGB } from './types';
import { PAGE_BG } from './constants';

export function setTextColor(doc: jsPDF, rgb: RGB): void {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

export function setDrawColor(doc: jsPDF, rgb: RGB): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

export function setFillColor(doc: jsPDF, rgb: RGB): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

export function splitText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

export function splitAndClamp(doc: jsPDF, text: string, maxWidth: number, maxLines: number): string[] {
  const raw = splitText(doc, text, maxWidth);
  if (raw.length <= maxLines) {
    return raw;
  }

  const lines = raw.slice(0, maxLines);
  const tail = lines[maxLines - 1];
  lines[maxLines - 1] = tail ? `${tail.replace(/\s+$/, '')}...` : '...';
  return lines;
}

export function textBlockHeight(lines: string[], fontSize: number, lineHeightFactor = 1.15): number {
  return Math.max(1, lines.length) * fontSize * lineHeightFactor;
}

export function drawRoundedCard(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB, border: RGB): void {
  setFillColor(doc, fill);
  setDrawColor(doc, border);
  doc.roundedRect(x, y, w, h, 10, 10, 'FD');
}

export function drawPill(doc: jsPDF, label: string, x: number, y: number, fill: RGB, text: RGB): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const textWidth = doc.getTextWidth(label);
  const width = textWidth + 14;
  const height = 14;

  setFillColor(doc, fill);
  setDrawColor(doc, fill);
  doc.roundedRect(x, y, width, height, 7, 7, 'FD');

  setTextColor(doc, text);
  doc.text(label, x + 7, y + 10);
  return width;
}

export function drawPageBackground(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  setFillColor(doc, PAGE_BG);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
}
