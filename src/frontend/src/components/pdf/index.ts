import jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import { buildPermissionDetails } from '../../permission-explainer';
import { resolveExtensionDisplayName } from '../../report-display';
import { buildPhases } from '../../utils/build-phases';
import type { PdfPhaseEntry } from './types';
import { SEVERITY_STYLES } from './constants';
import { drawPageBackground } from './primitives';
import { getStoreLabel, severityOrder } from './labels';
import { loadLogoPngDataUrl } from './logo';
import { drawHeader } from './header';
import { drawVerdictCard } from './verdict-card';
import { drawMetricRow } from './metric-cards';
import { drawPhasesSection, drawAnalysisLimitsSection } from './phases-section';
import { drawPermissionsSection } from './permissions-section';
import { drawFindingsSection } from './findings-section';
import { drawMetadataSection } from './metadata-section';

export async function downloadReportPdf(report: AnalysisReport): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin       = 26;
  const contentWidth = pageWidth - (margin * 2);
  const maxY         = pageHeight - margin;

  // Build phases using the same shared logic as the React UI.
  const reportPhases = buildPhases(report);
  const phases: PdfPhaseEntry[] = reportPhases.map((p) => {
    const entry: PdfPhaseEntry = { title: p.title, status: p.status, detail: p.detail };
    if (p.scanQuality !== undefined) entry.scanQuality = p.scanQuality;
    return entry;
  });

  const findings = [...report.riskSignals].sort((a, b) => {
    const severityDelta = severityOrder(a) - severityOrder(b);
    if (severityDelta !== 0) return severityDelta;
    return b.scoreImpact - a.scoreImpact;
  });

  const permissionDetails = buildPermissionDetails(report);
  const extensionName     = resolveExtensionDisplayName(report);
  const store             = getStoreLabel(report);
  const logoDataUrl       = await loadLogoPngDataUrl('/brand-icon.svg');
  const verdictStyle      = SEVERITY_STYLES[report.score.severity];

  drawPageBackground(doc, pageWidth, pageHeight);

  let y = margin;

  const headerHeight = drawHeader(
    doc, y, contentWidth, margin, pageWidth,
    extensionName, report.metadata.version, report.metadata.manifestVersion,
    store, logoDataUrl
  );
  y += headerHeight + 12;

  const verdictCardHeight = drawVerdictCard(
    doc, report, y, margin, contentWidth,
    extensionName, store, verdictStyle
  );
  y += verdictCardHeight + 10;

  const metricHeight = drawMetricRow(
    doc, y, margin, contentWidth,
    store, report.source, report
  );
  y += metricHeight + 10;

  // ── Tab 1: Overview — permissions ─────────────────────────────────────────
  y = drawPermissionsSection(doc, permissionDetails, y, margin, contentWidth, pageWidth, pageHeight, maxY);
  y += 10;

  // ── Tab 2: Findings ───────────────────────────────────────────────────────
  y = drawFindingsSection(doc, findings, y, margin, contentWidth, pageWidth, pageHeight, maxY);
  y += 10;

  // ── Tab 3: Metadata ───────────────────────────────────────────────────────
  y = drawMetadataSection(doc, report, y, margin, contentWidth, pageWidth, pageHeight, maxY);

  // ── Tab 4: Phases ─────────────────────────────────────────────────────────
  if (y + 80 > maxY) {
    doc.addPage();
    drawPageBackground(doc, pageWidth, pageHeight);
    y = margin;
  }

  const phasesHeight = drawPhasesSection(doc, phases, y, margin, contentWidth);
  y += phasesHeight + 8;

  const limitsHeight = drawAnalysisLimitsSection(
    doc, report.limits.notes, y, margin, contentWidth
  );
  if (limitsHeight > 0) y += limitsHeight + 8;

  // Filename: extensionchecker-{store}-{title}-{version}.pdf
  // e.g. extensionchecker-chrome-grammarly-14.1277.0.pdf
  const storeSlug = store
    .toLowerCase()
    .replace(/\s+/g, '-')       // "Chrome Web Store" → "chrome-web-store"
    .replace(/[^a-z0-9-]/g, '') // strip anything else
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';

  const titleSlug = extensionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    || 'extension';

  const versionSlug = report.metadata.version
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || '0';

  doc.save(`extensionchecker-${storeSlug}-${titleSlug}-${versionSlug}.pdf`);
}
