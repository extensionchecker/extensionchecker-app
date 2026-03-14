import type { ThemePreference, SeverityOrder } from '../types';

export const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];
export const CHROME_EXTENSION_ID_REGEX = /^[a-p]{32}$/;
export const SAFARI_APP_STORE_ID_REGEX = /^id\d{6,}$/i;
export const GITHUB_REPO_URL = 'https://github.com/extensionchecker/extensionchecker-app';

export const SEVERITY_ORDER: SeverityOrder = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
