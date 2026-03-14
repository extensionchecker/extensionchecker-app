import type { ThemePreference, SeverityOrder } from '../types';

export const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];
export const CHROME_EXTENSION_ID_REGEX = /^[a-p]{32}$/;
export const SAFARI_APP_STORE_ID_REGEX = /^id\d{6,}$/i;
export const GITHUB_REPO_URL = 'https://github.com/extensionchecker/extensionchecker-app';

// Maximum character length accepted from URL query parameters (extensionId, extensionUrl).
// Extension store IDs are at most ~50 chars; full store listing URLs are comfortably under 2 KB.
// Reject anything longer as a garbage / injection attempt before touching state or validation.
export const MAX_QUERY_PARAM_VALUE_LENGTH = 2048;

export const SEVERITY_ORDER: SeverityOrder = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
