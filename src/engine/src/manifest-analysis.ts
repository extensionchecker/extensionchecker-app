import type { AnalysisSource, AnalysisReport, RiskSignal } from '@extensionchecker/shared';
export type { ManifestLike } from './types';
import type { ManifestLike } from './types';
import { toSeverity, capScore } from './scoring';
import { normalizeHostPermissions } from './permissions';
import {
  evaluatePermissionWeights,
  evaluateBroadHostAccess,
  evaluateContentScripts,
  evaluateCookieBroadHostCombo,
  evaluateExternallyConnectable
} from './rules';

export function analyzeManifest(manifest: ManifestLike, source: AnalysisSource): AnalysisReport {
  const requestedPermissions = (manifest.permissions ?? []).filter((permission) => !permission.includes('://') && permission !== '<all_urls>');
  const optionalPermissions = manifest.optional_permissions ?? [];
  const hostPermissions = normalizeHostPermissions(manifest);

  const ruleResults = [
    evaluatePermissionWeights(requestedPermissions),
    evaluateBroadHostAccess(hostPermissions),
    evaluateContentScripts(manifest),
    evaluateCookieBroadHostCombo(requestedPermissions, optionalPermissions, hostPermissions),
    evaluateExternallyConnectable(manifest)
  ];

  const riskSignals: RiskSignal[] = ruleResults.flatMap((result) => result.signals);
  const rawScore = ruleResults.reduce((sum, result) => sum + result.score, 0);
  const cappedScore = capScore(rawScore);
  const severity = toSeverity(cappedScore);

  const summary = riskSignals.length === 0
    ? 'No significant capability signals were found in the manifest. This extension requests minimal browser access.'
    : `Detected ${riskSignals.length} manifest-derived capability signal(s). Highest observed severity: ${severity}.`;

  return {
    reportVersion: '1.0.0',
    analyzedAt: new Date().toISOString(),
    source,
    metadata: {
      name: manifest.name,
      version: manifest.version,
      manifestVersion: manifest.manifest_version === 3 ? 3 : 2
    },
    permissions: {
      requestedPermissions,
      optionalPermissions,
      hostPermissions
    },
    riskSignals,
    score: {
      value: cappedScore,
      severity,
      rationale: 'Score reflects the capability footprint declared in the extension manifest.'
    },
    permissionsScore: cappedScore,
    summary,
    limits: {
      codeExecutionAnalysisPerformed: false,
      notes: [
        'Manifest-first analysis only in v1 baseline.',
        'No dynamic execution or full source-code semantic analysis was performed.'
      ]
    }
  };
}
