export const PERMISSION_WEIGHTS: Record<string, number> = {
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

export const BROAD_HOST_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);
