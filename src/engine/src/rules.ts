import type { RiskSignal } from '@extensionchecker/shared';
import type { ManifestLike } from './types';
import { PERMISSION_WEIGHTS, BROAD_HOST_PATTERNS } from './constants';

export interface RuleResult {
  score: number;
  signals: RiskSignal[];
}

export function evaluatePermissionWeights(requestedPermissions: string[]): RuleResult {
  let score = 0;
  const signals: RiskSignal[] = [];

  for (const permission of requestedPermissions) {
    const permissionWeight = PERMISSION_WEIGHTS[permission];
    if (!permissionWeight) {
      continue;
    }

    score += permissionWeight;
    signals.push({
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

  return { score, signals };
}

export function evaluateBroadHostAccess(hostPermissions: string[]): RuleResult {
  const broadHosts = hostPermissions.filter((hostPermission) => BROAD_HOST_PATTERNS.has(hostPermission));
  if (broadHosts.length === 0) {
    return { score: 0, signals: [] };
  }

  return {
    score: 35,
    signals: [{
      id: 'broad-host-access',
      title: 'Broad host access',
      severity: 'high',
      description: 'Extension can access a broad set of websites, increasing exposure to sensitive page data.',
      evidence: broadHosts.map((hostPermission) => ({
        key: 'host_permission',
        value: hostPermission
      })),
      scoreImpact: 35
    }]
  };
}

export function evaluateContentScripts(manifest: ManifestLike): RuleResult {
  const contentScriptMatches = manifest.content_scripts?.flatMap((entry) => entry.matches ?? []) ?? [];
  if (contentScriptMatches.length === 0) {
    return { score: 0, signals: [] };
  }

  return {
    score: 15,
    signals: [{
      id: 'content-script-injection',
      title: 'Content script injection',
      severity: 'medium',
      description: 'Extension declares content script execution on matching pages.',
      evidence: contentScriptMatches.slice(0, 5).map((matchPattern) => ({
        key: 'content_script_match',
        value: matchPattern
      })),
      scoreImpact: 15
    }]
  };
}

export function evaluateCookieBroadHostCombo(
  requestedPermissions: string[],
  optionalPermissions: string[],
  hostPermissions: string[]
): RuleResult {
  const hasCookieAccess = requestedPermissions.includes('cookies') || optionalPermissions.includes('cookies');
  const broadHosts = hostPermissions.filter((hostPermission) => BROAD_HOST_PATTERNS.has(hostPermission));

  if (!hasCookieAccess || broadHosts.length === 0) {
    return { score: 0, signals: [] };
  }

  return {
    score: 20,
    signals: [{
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
    }]
  };
}

export function evaluateExternallyConnectable(manifest: ManifestLike): RuleResult {
  if (!manifest.externally_connectable) {
    return { score: 0, signals: [] };
  }

  const matches = manifest.externally_connectable.matches ?? [];
  const ids = manifest.externally_connectable.ids ?? [];

  if (matches.length === 0 && ids.length === 0) {
    return { score: 0, signals: [] };
  }

  return {
    score: 12,
    signals: [{
      id: 'externally-connectable',
      title: 'Externally connectable surface',
      severity: 'medium',
      description: 'The extension exposes external connection surfaces that should be reviewed for trust boundaries.',
      evidence: [
        ...matches.map((matchPattern) => ({
          key: 'externally_connectable_match' as const,
          value: matchPattern
        })),
        ...ids.map((id) => ({
          key: 'externally_connectable_id' as const,
          value: id
        }))
      ],
      scoreImpact: 12
    }]
  };
}
