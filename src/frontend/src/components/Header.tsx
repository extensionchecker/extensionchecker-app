import type { ThemePreference, AppRoute } from '../types';
import { iconForTheme } from '../utils/formatting';

interface HeaderProps {
  theme: ThemePreference;
  nextTheme: ThemePreference;
  onThemeToggle: () => void;
  onNavigate: (route: AppRoute) => void;
}

export function Header({ theme, nextTheme, onThemeToggle, onNavigate }: HeaderProps) {
  return (
    <header className="header">
      <a href="/" className="brand" onClick={(e) => { e.preventDefault(); onNavigate('scan'); }}>
        <img src="/brand-icon.svg" alt="ExtensionChecker logo" className="brand-icon" />
        <h1>ExtensionChecker</h1>
      </a>
      <button
        type="button"
        className="theme-toggle"
        onClick={onThemeToggle}
        aria-label={`Theme: ${theme}. Switch to ${nextTheme}.`}
        title={`Theme: ${theme}. Switch to ${nextTheme}.`}
      >
        <span className="material-symbols-outlined" aria-hidden="true">{iconForTheme(theme)}</span>
      </button>
    </header>
  );
}
