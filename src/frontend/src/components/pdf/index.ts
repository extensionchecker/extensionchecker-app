import jsPDF from 'jspdf';
import type { AnalysisReport } from '@extensionchecker/shared';
import { buildPermissionDetails } from '../../permission-explainer';
import { resolveExtensionDisplayName } from '../../report-display';
import type { PhaseEntry } from './types';
import { SEVERITY_STYLES } from './constants';
import { drawPageBackground } from './primitives';
import { getStoreLabel, severityOrder } from './labels';
import { loadLogoPngDataUrl } from './logo';
import { drawHeader } from './header';
import { drawVerdictCard } from './verdict-card';
import { drawMetricRow } from './metric-cards';
import { drawPhasesSection } from './phases-section';
import { drawPermissionsSection } from './permissions-section';
import { drawFindingsSection } from './findings-section';

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

  const phasesHeight = drawPhasesSection(doc, phases, y, margin, contentWidth);
  y += phasesHeight + 10;

  y = drawPermissionsSection(doc, permissionDetails, y, margin, contentWidth, pageWidth, pageHeight, maxY);
  y = drawFindingsSection(doc, findings, y, margin, contentWidth, pageWidth, pageHeight, maxY);

  const safeName = extensionName
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'extension';

  doc.save(`extensionchecker-${safeName}.pdf`);
}
