import jsPDF from 'jspdf';
import type { AnalysisReport, RiskSignal, Severity } from '@extensionchecker/shared';
import { buildPermissionDetails, type PermissionDetail } from './permission-explainer';
import { resolveExtensionDisplayName } from './report-display';

type RGB = [number, number, number];

type PhaseEntry = {
  title: string;
  status: 'Complete' | 'Not Available';
  detail: string;
};

type SeverityStyle = {
  fill: RGB;
  border: RGB;
  text: RGB;
  pillFill: RGB;
};

const PAGE_BG: RGB = [244, 247, 255];
const HEADER_BG: RGB = [16, 35, 76];
const HEADER_TEXT: RGB = [240, 246, 255];
const BODY_TEXT: RGB = [25, 33, 49];
const MUTED_TEXT: RGB = [93, 104, 128];
const CARD_BG: RGB = [255, 255, 255];
const CARD_BORDER: RGB = [214, 224, 243];

const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  low: {
    fill: [234, 249, 238],
    border: [92, 192, 112],
    text: [28, 113, 53],
    pillFill: [214, 243, 222]
  },
  medium: {
    fill: [255, 245, 226],
    border: [235, 172, 71],
    text: [132, 85, 21],
    pillFill: [255, 234, 194]
  },
  high: {
    fill: [255, 232, 232],
    border: [230, 94, 94],
    text: [141, 36, 36],
    pillFill: [255, 214, 214]
  },
  critical: {
    fill: [255, 221, 225],
    border: [214, 62, 88],
    text: [118, 18, 38],
    pillFill: [255, 199, 209]
  }
};

function getStoreLabel(report: AnalysisReport): string {
  if (report.source.type === 'file') {
    return 'Uploaded package';
  }

  const value = report.source.value;

  if (report.source.type === 'id') {
    if (value.startsWith('chrome:') || /^[a-p]{32}$/.test(value)) {
      return 'Chrome Web Store';
    }

    if (value.startsWith('firefox:')) {
      return 'Firefox Add-ons';
    }

    return 'Extension ID';
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('chromewebstore.google.com') || host.includes('chrome.google.com') || host.includes('clients2.google.com')) {
      return 'Chrome Web Store';
    }

    if (host.includes('addons.mozilla.org')) {
      return 'Firefox Add-ons';
    }

    if (host.includes('safari') || host.includes('apple.com')) {
      return 'Safari Extensions';
    }
  } catch {
    return 'Unknown store';
  }

  return 'Unknown store';
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Failed to convert file to data URL.'));
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(blob);
  });
}

async function loadLogoPngDataUrl(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      return null;
    }

    const svgBlob = await response.blob();
    const svgDataUrl = await toDataUrl(svgBlob);

    const pngDataUrl = await new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve(null);
      image.src = svgDataUrl;
    });

    return pngDataUrl;
  } catch {
    return null;
  }
}

function severityOrder(signal: RiskSignal): number {
  switch (signal.severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 3;
  }
}

function setTextColor(doc: jsPDF, rgb: RGB): void {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function setDrawColor(doc: jsPDF, rgb: RGB): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function setFillColor(doc: jsPDF, rgb: RGB): void {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function splitText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

function splitAndClamp(doc: jsPDF, text: string, maxWidth: number, maxLines: number): string[] {
  const raw = splitText(doc, text, maxWidth);
  if (raw.length <= maxLines) {
    return raw;
  }

  const lines = raw.slice(0, maxLines);
  const tail = lines[maxLines - 1];
  lines[maxLines - 1] = tail ? `${tail.replace(/\s+$/, '')}...` : '...';
  return lines;
}

function textBlockHeight(lines: string[], fontSize: number, lineHeightFactor = 1.15): number {
  return Math.max(1, lines.length) * fontSize * lineHeightFactor;
}

function drawRoundedCard(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB, border: RGB): void {
  setFillColor(doc, fill);
  setDrawColor(doc, border);
  doc.roundedRect(x, y, w, h, 10, 10, 'FD');
}

function drawPill(doc: jsPDF, label: string, x: number, y: number, fill: RGB, text: RGB): number {
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

function scoreColor(score: number): RGB {
  if (score <= 25) {
    return [44, 182, 87];
  }

  if (score <= 50) {
    return [235, 172, 71];
  }

  return [229, 87, 87];
}

function verdictLabel(report: AnalysisReport): string {
  if (report.score.severity === 'critical') {
    return 'High Danger';
  }

  if (report.score.severity === 'high') {
    return 'Dangerous';
  }

  if (report.score.severity === 'medium') {
    return 'Use Caution';
  }

  return report.riskSignals.length === 0 ? 'Likely Low Risk' : 'Low Risk (Review)';
}

function statusColor(status: 'Complete' | 'Not Available'): { fill: RGB; text: RGB } {
  if (status === 'Complete') {
    return {
      fill: [214, 243, 222],
      text: [26, 110, 51]
    };
  }

  return {
    fill: [255, 234, 194],
    text: [132, 85, 21]
  };
}

function drawSmallMetricCard(doc: jsPDF, x: number, y: number, w: number, h: number, title: string, lines: string[]): void {
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

function drawStoreMetricCard(
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

function drawPageBackground(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  setFillColor(doc, PAGE_BG);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
}

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

export async function downloadReportPdf(report: AnalysisReport): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 26;
  const contentWidth = pageWidth - (margin * 2);
  const maxY = pageHeight - margin;

  const phases: PhaseEntry[] = [
    {
      title: 'Phase 1: Manifest Analysis',
      status: 'Complete',
      detail: 'Manifest-derived capability analysis completed.'
    },
    {
      title: 'Phase 2: Code Analysis',
      status: report.limits.codeExecutionAnalysisPerformed ? 'Complete' : 'Not Available',
      detail: report.limits.codeExecutionAnalysisPerformed
        ? 'Code analysis completed.'
        : 'Deeper code/runtime analysis is not available in this version.'
    }
  ];

  const findings = [...report.riskSignals].sort((a, b) => {
    const severityDelta = severityOrder(a) - severityOrder(b);
    if (severityDelta !== 0) {
      return severityDelta;
    }

    return b.scoreImpact - a.scoreImpact;
  });
  const permissionDetails = buildPermissionDetails(report);
  const extensionName = resolveExtensionDisplayName(report);

  const store = getStoreLabel(report);
  const logoDataUrl = await loadLogoPngDataUrl('/brand-icon.svg');
  const verdictStyle = SEVERITY_STYLES[report.score.severity];

  drawPageBackground(doc, pageWidth, pageHeight);

  let y = margin;

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
  doc.text(`v${report.metadata.version} (MV${report.metadata.manifestVersion}) • ${store}`, headerTextX, y + 61);

  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin - 12, y + 20, { align: 'right' });

  y += headerHeight + 12;

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

  y += verdictCardHeight + 10;

  const gap = 8;
  const metricWidth = (contentWidth - (gap * 2)) / 3;
  const metricHeight = 92;
  drawStoreMetricCard(doc, margin, y, metricWidth, metricHeight, store, report.source);
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

  y += metricHeight + 10;

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

  y += phaseDynamicHeight + 10;

  if (permissionDetails.length > 0) {
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
  }

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
  } else {
    const findingsHeaderHeight = 30;
    const firstCardHeight = measureFindingCardHeight(doc, findings[0]!, contentWidth);

    // Keep the findings heading together with at least one card.
    if (y + findingsHeaderHeight + firstCardHeight > maxY) {
      doc.addPage();
      drawPageBackground(doc, pageWidth, pageHeight);
      y = margin;
    }

    y = startFindingsSection(doc, 'Key Findings', margin, y);

    for (const finding of findings) {
      const cardHeight = measureFindingCardHeight(doc, finding, contentWidth);

      // Cards are atomic blocks; break before drawing if one does not fit.
      if (y + cardHeight > maxY) {
        doc.addPage();
        drawPageBackground(doc, pageWidth, pageHeight);
        y = startFindingsSection(doc, 'Key Findings (continued)', margin, margin);
      }

      const renderedHeight = drawFindingCard(doc, finding, margin, y, contentWidth);
      y += renderedHeight + 6;
    }
  }

  const safeName = extensionName
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'extension';

  doc.save(`extensionchecker-${safeName}.pdf`);
}
