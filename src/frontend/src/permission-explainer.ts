import type { AnalysisReport, Severity } from '@extensionchecker/shared';

export type PermissionDetail = {
  id: string;
  permission: string;
  source: 'requested' | 'optional' | 'host';
  sourceLabel: string;
  explanation: string;
  danger: string;
  severity: Severity;
};

type PermissionText = {
  explanation: string;
  danger: string;
  severity: Severity;
};

const BROAD_HOST_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const SOURCE_ORDER: Record<PermissionDetail['source'], number> = {
  requested: 0,
  host: 1,
  optional: 2
};

const PERMISSION_TEXT: Record<string, PermissionText> = {
  activeTab: {
    explanation: 'Temporary access to the currently active tab after user action.',
    danger: 'Lower risk alone, but still allows page-level data access when triggered.',
    severity: 'low'
  },
  tabs: {
    explanation: 'Can access tab metadata such as URLs, titles, and navigation state.',
    danger: 'Can reveal browsing activity and sensitive page context.',
    severity: 'medium'
  },
  cookies: {
    explanation: 'Can read and modify browser cookies for allowed sites.',
    danger: 'Can expose or alter authenticated session state and tracking identifiers.',
    severity: 'high'
  },
  webRequest: {
    explanation: 'Can observe outbound requests and related metadata.',
    danger: 'Can inspect browsing traffic patterns and potentially sensitive endpoints.',
    severity: 'high'
  },
  webRequestBlocking: {
    explanation: 'Can modify or block network requests before they complete.',
    danger: 'Can intercept, redirect, or block security-critical traffic flows.',
    severity: 'high'
  },
  scripting: {
    explanation: 'Can inject and execute scripts on matched pages.',
    danger: 'Can read or alter page content and interact with in-page data.',
    severity: 'medium'
  },
  history: {
    explanation: 'Can read browser history entries.',
    danger: 'Can expose detailed browsing behavior and interests.',
    severity: 'medium'
  },
  downloads: {
    explanation: 'Can create and manage downloads.',
    danger: 'Can trigger file delivery workflows that users may not expect.',
    severity: 'medium'
  },
  clipboardRead: {
    explanation: 'Can read data from the system clipboard.',
    danger: 'Can expose copied secrets such as passwords, keys, or tokens.',
    severity: 'high'
  },
  clipboardWrite: {
    explanation: 'Can write data into the system clipboard.',
    danger: 'Can replace copied content and facilitate user deception.',
    severity: 'medium'
  },
  debugger: {
    explanation: 'Can attach debugger capabilities to browser targets.',
    danger: 'High-power interface that can inspect and alter runtime behavior.',
    severity: 'high'
  },
  management: {
    explanation: 'Can inspect and control installed extensions.',
    danger: 'Can change extension state and affect browser security controls.',
    severity: 'high'
  },
  nativeMessaging: {
    explanation: 'Can communicate with local native host applications.',
    danger: 'Can bridge browser activity to local system-level processes.',
    severity: 'high'
  },
  storage: {
    explanation: 'Can store extension data persistently.',
    danger: 'Low direct risk; becomes relevant when combined with broader access.',
    severity: 'low'
  }
};

function demoteSeverityForOptional(severity: Severity): Severity {
  if (severity === 'critical') {
    return 'high';
  }

  if (severity === 'high') {
    return 'medium';
  }

  if (severity === 'medium') {
    return 'low';
  }

  return 'low';
}

function explainKnownPermission(permission: string): PermissionText {
  const known = PERMISSION_TEXT[permission];
  if (known) {
    return known;
  }

  return {
    explanation: `Declares "${permission}" as an extension capability.`,
    danger: 'Review whether this permission is required for the extension’s stated purpose.',
    severity: 'medium'
  };
}

function explainHostPermission(scope: string): PermissionText {
  if (BROAD_HOST_PATTERNS.has(scope)) {
    return {
      explanation: 'Matches a very broad set of websites.',
      danger: 'Broad host scope can expose browsing content, sessions, and page interactions at scale.',
      severity: 'high'
    };
  }

  if (scope.includes('*')) {
    return {
      explanation: 'Matches multiple hosts or URL paths using wildcards.',
      danger: 'Wildcard host access expands data exposure beyond a single site.',
      severity: 'medium'
    };
  }

  return {
    explanation: 'Matches a specific host pattern.',
    danger: 'Lower scope than wildcards, but still grants page-level access on matched sites.',
    severity: 'low'
  };
}

function buildRequestedDetails(report: AnalysisReport): PermissionDetail[] {
  return report.permissions.requestedPermissions.map((permission) => {
    const base = explainKnownPermission(permission);
    return {
      id: `requested:${permission}`,
      permission,
      source: 'requested',
      sourceLabel: 'Requested',
      explanation: base.explanation,
      danger: base.danger,
      severity: base.severity
    };
  });
}

function buildOptionalDetails(report: AnalysisReport): PermissionDetail[] {
  return report.permissions.optionalPermissions.map((permission) => {
    const base = explainKnownPermission(permission);
    return {
      id: `optional:${permission}`,
      permission,
      source: 'optional',
      sourceLabel: 'Optional',
      explanation: `${base.explanation} This can be requested later at runtime.`,
      danger: `Potential impact if user grants it later: ${base.danger.charAt(0).toLowerCase()}${base.danger.slice(1)}`,
      severity: demoteSeverityForOptional(base.severity)
    };
  });
}

function buildHostDetails(report: AnalysisReport): PermissionDetail[] {
  return report.permissions.hostPermissions.map((scope) => {
    const base = explainHostPermission(scope);
    return {
      id: `host:${scope}`,
      permission: scope,
      source: 'host',
      sourceLabel: 'Host Access',
      explanation: base.explanation,
      danger: base.danger,
      severity: base.severity
    };
  });
}

export function buildPermissionDetails(report: AnalysisReport): PermissionDetail[] {
  return [
    ...buildRequestedDetails(report),
    ...buildOptionalDetails(report),
    ...buildHostDetails(report)
  ].sort((a, b) => {
    const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const sourceDelta = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    return a.permission.localeCompare(b.permission);
  });
}
