import type { AppRoute } from '../types';
import { GITHUB_REPO_URL } from '../constants';

interface FooterProps {
  appVersion: string | null;
  onNavigate: (route: AppRoute) => void;
}

export function Footer({ appVersion, onNavigate }: FooterProps) {
  return (
    <footer className="app-footer">
      <div className="footer-row">
        <span>&copy; {new Date().getFullYear()} ExtensionChecker</span>
        <span className="footer-sep" aria-hidden="true">&middot;</span>
        <a href="/terms" onClick={(e) => { e.preventDefault(); onNavigate('terms'); }}>Terms</a>
        <span className="footer-sep" aria-hidden="true">&middot;</span>
        <a href="/privacy" onClick={(e) => { e.preventDefault(); onNavigate('privacy'); }}>Privacy</a>
        <span className="footer-sep" aria-hidden="true">&middot;</span>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        {appVersion ? (
          <>
            <span className="footer-sep" aria-hidden="true">&middot;</span>
            <span>v{appVersion}</span>
          </>
        ) : null}
      </div>
    </footer>
  );
}
