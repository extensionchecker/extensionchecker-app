const CHROME_EXTENSION_ID_REGEX = /^[a-p]{32}$/;

function findChromeId(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const maybeId = segments.find((segment) => CHROME_EXTENSION_ID_REGEX.test(segment.toLowerCase()));
  return maybeId ? maybeId.toLowerCase() : null;
}

function findFirefoxSlug(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const addonIndex = segments.findIndex((segment) => segment === 'addon');
  if (addonIndex < 0 || addonIndex >= segments.length - 1) {
    return null;
  }

  const slug = segments[addonIndex + 1];
  return slug ? decodeURIComponent(slug) : null;
}

function findEdgeId(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  // Edge URLs: /addons/detail/{name-slug}/{extension-id}
  const detailIndex = segments.findIndex((segment) => segment === 'detail');
  if (detailIndex < 0 || detailIndex >= segments.length - 1) {
    return null;
  }

  // The ID is the last segment after 'detail', possibly after a name slug
  const candidates = segments.slice(detailIndex + 1);
  const maybeId = candidates.find((segment) => CHROME_EXTENSION_ID_REGEX.test(segment.toLowerCase()));
  return maybeId ? maybeId.toLowerCase() : null;
}

export function resolveListingUrlToId(listingUrl: URL): string | null {
  const host = listingUrl.hostname.toLowerCase();

  if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') {
    const chromeId = findChromeId(listingUrl.pathname);
    return chromeId ? `chrome:${chromeId}` : null;
  }

  if (host === 'addons.mozilla.org') {
    const firefoxSlug = findFirefoxSlug(listingUrl.pathname);
    return firefoxSlug ? `firefox:${firefoxSlug}` : null;
  }

  if (host === 'microsoftedge.microsoft.com') {
    const edgeId = findEdgeId(listingUrl.pathname);
    return edgeId ? `edge:${edgeId}` : null;
  }

  return null;
}
