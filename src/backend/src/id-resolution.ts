import type { PackageKind } from './archive';

const CHROME_EXTENSION_ID_REGEX = /^[a-p]{32}$/;
const SOURCE_PREFIX_REGEX = /^(?<ecosystem>chrome|firefox|safari|edge):(?<rawId>.+)$/i;
const SAFARI_APP_STORE_ID_REGEX = /^id\d{6,}$/i;
export type ExtensionEcosystem = 'chrome' | 'firefox' | 'edge';

export type ResolvedExtensionId = {
  ecosystem: ExtensionEcosystem;
  canonicalId: string;
  downloadUrl: URL;
  packageKind: PackageKind;
};

function resolveChromeId(rawId: string): ResolvedExtensionId {
  const trimmedId = rawId.trim().toLowerCase();
  if (!CHROME_EXTENSION_ID_REGEX.test(trimmedId)) {
    throw new Error('Chrome extension IDs must be 32 characters using letters a-p.');
  }

  const updateUrl = new URL('https://clients2.google.com/service/update2/crx');
  updateUrl.searchParams.set('response', 'redirect');
  updateUrl.searchParams.set('prodversion', '131.0.0.0');
  updateUrl.searchParams.set('acceptformat', 'crx2,crx3');
  updateUrl.searchParams.set('x', `id=${trimmedId}&installsource=ondemand&uc`);

  return {
    ecosystem: 'chrome',
    canonicalId: trimmedId,
    downloadUrl: updateUrl,
    packageKind: 'crx'
  };
}

function resolveFirefoxId(rawId: string): ResolvedExtensionId {
  const trimmedId = rawId.trim();
  if (trimmedId.length < 2) {
    throw new Error('Firefox add-on identifier is too short.');
  }

  const downloadUrl = new URL(`https://addons.mozilla.org/firefox/downloads/latest/${encodeURIComponent(trimmedId)}/addon-latest.xpi`);

  return {
    ecosystem: 'firefox',
    canonicalId: trimmedId,
    downloadUrl,
    packageKind: 'xpi'
  };
}

function resolveEdgeId(rawId: string): ResolvedExtensionId {
  const trimmedId = rawId.trim().toLowerCase();
  if (!CHROME_EXTENSION_ID_REGEX.test(trimmedId)) {
    throw new Error('Edge extension IDs must be 32 characters using letters a-p.');
  }

  const updateUrl = new URL('https://edge.microsoft.com/extensionwebstorebase/v1/crx');
  updateUrl.searchParams.set('response', 'redirect');
  updateUrl.searchParams.set('x', `id=${trimmedId}&installsource=ondemand&uc`);

  return {
    ecosystem: 'edge',
    canonicalId: trimmedId,
    downloadUrl: updateUrl,
    packageKind: 'crx'
  };
}

export function resolveExtensionIdCandidates(rawInput: string): ResolvedExtensionId[] {
  const input = rawInput.trim();
  if (!input) {
    throw new Error('Extension ID must be non-empty.');
  }

  const prefixedMatch = SOURCE_PREFIX_REGEX.exec(input);
  if (prefixedMatch?.groups) {
    const ecosystem = prefixedMatch.groups.ecosystem;
    const rawId = prefixedMatch.groups.rawId;
    if (!ecosystem || !rawId) {
      throw new Error('Extension ID prefix is malformed.');
    }

    if (ecosystem.toLowerCase() === 'chrome') {
      return [resolveChromeId(rawId)];
    }

    if (ecosystem.toLowerCase() === 'edge') {
      return [resolveEdgeId(rawId)];
    }

    if (ecosystem.toLowerCase() === 'safari') {
      throw new Error('Safari extension IDs are not resolvable via store API. Upload an extension archive obtained separately (for example from developer build artifacts).');
    }

    return [resolveFirefoxId(rawId)];
  }

  if (CHROME_EXTENSION_ID_REGEX.test(input.toLowerCase())) {
    return [resolveChromeId(input), resolveEdgeId(input)];
  }

  if (SAFARI_APP_STORE_ID_REGEX.test(input)) {
    throw new Error('Safari App Store IDs are not resolvable as extension packages. Upload an extension archive obtained separately (for example from developer build artifacts).');
  }

  return [resolveFirefoxId(input)];
}

export function resolveExtensionIdToPackage(rawInput: string): ResolvedExtensionId {
  return resolveExtensionIdCandidates(rawInput)[0];
}
