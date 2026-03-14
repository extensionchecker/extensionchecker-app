import type { ManifestLike } from './types';

export function normalizeHostPermissions(manifest: ManifestLike): string[] {
  const manifestHosts = manifest.host_permissions ?? [];
  const mv2HostPermissions = (manifest.permissions ?? []).filter((permission) => permission.includes('://') || permission === '<all_urls>');

  return [...new Set([...manifestHosts, ...mv2HostPermissions])];
}
