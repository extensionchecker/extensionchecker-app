import { useCallback, useEffect, useState } from 'react';
import type { ThemePreference } from '../types';

export function useThemePreference(): [ThemePreference, (nextTheme: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    const persisted = globalThis.localStorage?.getItem('theme');
    if (persisted === 'light' || persisted === 'dark' || persisted === 'system') {
      return persisted;
    }

    return 'system';
  });

  const applyTheme = useCallback((nextTheme: ThemePreference): void => {
    setTheme(nextTheme);
    globalThis.localStorage?.setItem('theme', nextTheme);

    const root = globalThis.document?.documentElement;
    if (!root) {
      return;
    }

    if (nextTheme === 'system') {
      root.removeAttribute('data-theme');
      return;
    }

    root.setAttribute('data-theme', nextTheme);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [applyTheme, theme]);

  return [theme, applyTheme];
}
