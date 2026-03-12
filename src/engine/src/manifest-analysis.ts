import type { AnalysisSource, AnalysisReport, RiskSignal, Severity } from '@extensionchecker/shared';

const PERMISSION_WEIGHTS: Record<string, number> = {
  cookies: 20,
  webRequest: 20,
  webRequestBlocking: 25,
  tabs: 10,
  history: 12,
  debugger: 25,
  nativeMessaging: 30,
  management: 30,
  downloads: 10,
  clipboardRead: 10,
  clipboardWrite: 8,
  scripting: 10,
  activeTab: 5
};

const BROAD_HOST_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

export type ManifestLike = {
  name: string;
  version: string;
  manifest_version: number;
  permissions?: string[] | undefined;
  optional_permissions?: string[] | undefined;
  host_permissions?: string[] | undefined;
  content_scripts?: Array<{
    matches?: string[] | undefined;
    js?: string[] | undefined;
  }> | undefined;
  externally_connectable?: {
    matches?: string[] | undefined;
    ids?: string[] | undefined;
  } | undefined;
};

function toSeverity(score: number): Severity {
  if (score >= 75) {
    return 'critical';
  }

  if (score >= 50) {
    return 'high';
  }

  if (score >= 25) {
    return 'medium';
  }

  return 'low';
}

function capScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function normalizeHostPermissions(manifest: ManifestLike): string[] {
  const manifestHosts = manifest.host_permissions ?? [];
  const mv2HostPermissions = (manifest.permissions ?? []).filter((permission) => permission.includes('://') || permission === '<all_urls>');

  return [...new Set([...manifestHosts, ...mv2HostPermissions])];
}

export function analyzeManifest(manifest: ManifestLike, source: AnalysisSource): AnalysisReport {
  const requestedPermissions = (manifest.permissions ?? []).filter((permission) => !permission.includes('://') && permission !== '<all_urls>');
  const optionalPermissions = manifest.optional_permissions ?? [];
  const hostPermissions = normalizeHostPermissions(manifest);

  const riskSignals: RiskSignal[] = [];

  let score = 0;
  for (const permission of requestedPermissions) {
    const permissionWeight = PERMISSION_WEIGHTS[permission];
    if (!permissionWeight) {
      continue;
    }

    score += permissionWeight;
    riskSignals.push({
      id: `permission-${permission}`,
      title: `Sensitive permission: ${permission}`,
      severity: permissionWeight >= 25 ? 'high' : permissionWeight >= 12 ? 'medium' : 'low',
      description: `The extension requests ${permission}, which expands available runtime capabilities.`,
      evidence: [
        {
          key: 'permission',
          value: permission
        }
      ],
      scoreImpact: permissionWeight
    });
  }

  const broadHosts = hostPermissions.filter((hostPermission) => BROAD_HOST_PATTERNS.has(hostPermission));
  if (broadHosts.length > 0) {
    score += 35;
    riskSignals.push({
      id: 'broad-host-access',
      title: 'Broad host access',
      severity: 'high',
      description: 'Extension can access a broad set of websites, increasing exposure to sensitive page data.',
      evidence: broadHosts.map((hostPermission) => ({
        key: 'host_permission',
        value: hostPermission
      })),
      scoreImpact: 35
    });
  }

  const contentScriptMatches = manifest.content_scripts?.flatMap((entry) => entry.matches ?? []) ?? [];
  if (contentScriptMatches.length > 0) {
    score += 15;
    riskSignals.push({
      id: 'content-script-injection',
      title: 'Content script injection',
      severity: 'medium',
      description: 'Extension declares content script execution on matching pages.',
      evidence: contentScriptMatches.slice(0, 5).map((matchPattern) => ({
        key: 'content_script_match',
        value: matchPattern
      })),
      scoreImpact: 15
    });
  }

  const hasCookieAccess = requestedPermissions.includes('cookies') || optionalPermissions.includes('cookies');
  if (hasCookieAccess && broadHosts.length > 0) {
    score += 20;
    riskSignals.push({
      id: 'cookie-access-with-broad-hosts',
      title: 'Cookie access with broad hosts',
      severity: 'high',
      description: 'Combining cookies permission with broad host access can expose authenticated session data.',
      evidence: [
        {
          key: 'permission',
          value: 'cookies'
        },
        ...broadHosts.map((hostPermission) => ({
          key: 'host_permission',
          value: hostPermission
        }))
      ],
      scoreImpact: 20
    });
  }

  if (manifest.externally_connectable && ((manifest.externally_connectable.matches?.length ?? 0) > 0 || (manifest.externally_connectable.ids?.length ?? 0) > 0)) {
    score += 12;
    riskSignals.push({
      id: 'externally-connectable',
      title: 'Externally connectable surface',
      severity: 'medium',
      description: 'The extension exposes external connection surfaces that should be reviewed for trust boundaries.',
      evidence: [
        ...(manifest.externally_connectable.matches ?? []).map((matchPattern) => ({
          key: 'externally_connectable_match',
          value: matchPattern
        })),
        ...(manifest.externally_connectable.ids ?? []).map((id) => ({
          key: 'externally_connectable_id',
          value: id
        }))
      ],
      scoreImpact: 12
    });
  }

  const cappedScore = capScore(score);
  const severity = toSeverity(cappedScore);

  const summary = riskSignals.length === 0
    ? 'Low declared risk based on manifest-only review. No high-impact permissions or broad host access were found.'
    : `Detected ${riskSignals.length} manifest-derived risk signal(s). Highest observed severity: ${severity}.`;

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
      rationale: 'Score is computed by deterministic manifest permission and capability rules.'
    },
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
