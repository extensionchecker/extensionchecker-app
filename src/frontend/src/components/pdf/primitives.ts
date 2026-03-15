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

/**
 * Approximates a filled arc sector (pie slice) as a polygon using many short
 * line segments. Angles are in degrees, starting from the top (12 o'clock),
 * going clockwise — matching the CSS conic-gradient convention used by the
 * website's score donuts.
 *
 * Uses jsPDF's lines() with relative coordinates and closed=true so that the
 * path automatically closes back to the center point.
 */
function fillArcSector(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): void {
  const STEPS = 64;
  const toRad = (deg: number): number => (deg - 90) * (Math.PI / 180);
  const startRad = toRad(startDeg);
  const endRad   = toRad(endDeg);

  const relLines: Array<[number, number]> = [];
  const firstX = cx + r * Math.cos(startRad);
  const firstY = cy + r * Math.sin(startRad);
  relLines.push([firstX - cx, firstY - cy]);

  let prevX = firstX;
  let prevY = firstY;
  for (let i = 1; i <= STEPS; i++) {
    const angle = startRad + (endRad - startRad) * (i / STEPS);
    const curX  = cx + r * Math.cos(angle);
    const curY  = cy + r * Math.sin(angle);
    relLines.push([curX - prevX, curY - prevY]);
    prevX = curX;
    prevY = curY;
  }

  doc.lines(relLines, cx, cy, undefined, 'F', true);
}

/**
 * Draws a score donut ring:
 *   - grey background ring (full circle)
 *   - coloured arc for the score fraction (0..1), starting from top
 *   - white hole circle to create the donut shape
 *
 * Mirrors the ScoreDonut React component's conic-gradient ring.
 */
export function drawScoreDonutRing(
  doc:          jsPDF,
  cx:           number,
  cy:           number,
  outerRadius:  number,
  innerRadius:  number,
  fraction:     number,
  ringColor:    RGB,
  bgRingColor:  RGB,
  holeColor:    RGB
): void {
  setFillColor(doc, bgRingColor);
  doc.circle(cx, cy, outerRadius, 'F');

  const clamped = Math.min(1, Math.max(0, fraction));
  if (clamped > 0.001) {
    setFillColor(doc, ringColor);
    fillArcSector(doc, cx, cy, outerRadius, 0, clamped * 360);
  }

  setFillColor(doc, holeColor);
  doc.circle(cx, cy, innerRadius, 'F');
}

/**
 * Draws the code-findings donut — a multi-colour ring where each severity
 * group gets its own arc segment. Mirrors FindingsSeverityDonut.tsx.
 *
 * If all segments have zero fraction the ring is drawn solid green (clean).
 */
export function drawFindingsDonutRing(
  doc:         jsPDF,
  cx:          number,
  cy:          number,
  outerRadius: number,
  innerRadius: number,
  segments:    ReadonlyArray<{ fraction: number; color: RGB }>,
  cleanColor:  RGB,
  holeColor:   RGB
): void {
  const hasAny = segments.some((s) => s.fraction > 0.001);

  if (!hasAny) {
    setFillColor(doc, cleanColor);
    doc.circle(cx, cy, outerRadius, 'F');
    setFillColor(doc, holeColor);
    doc.circle(cx, cy, innerRadius, 'F');
    return;
  }

  let startDeg = 0;
  for (const seg of segments) {
    if (seg.fraction <= 0.001) continue;
    const spanDeg = seg.fraction * 360;
    setFillColor(doc, seg.color);
    fillArcSector(doc, cx, cy, outerRadius, startDeg, startDeg + spanDeg);
    startDeg += spanDeg;
  }

  setFillColor(doc, holeColor);
  doc.circle(cx, cy, innerRadius, 'F');
}
