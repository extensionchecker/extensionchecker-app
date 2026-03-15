import { useMemo } from 'react';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';
import DOMPurify from 'dompurify';

const md = new Marked({ gfm: true }).use(markedAlert());

export interface MarkdownPageProps {
  markdown: string;
  onBack: () => void;
}

export function MarkdownPage({ markdown, onBack }: MarkdownPageProps) {
  // Markdown source is inlined at build time from docs/*.md (first-party static content).
  // DOMPurify sanitizes the rendered HTML as a defence-in-depth measure.
  const safeHtml = useMemo(() => {
    const raw = md.parse(markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [markdown]);

  return (
    <section className="markdown-page">
      <nav className="markdown-nav">
        <button type="button" className="results-nav-action" onClick={onBack}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back
        </button>
      </nav>
      {/* safeHtml is DOMPurify-sanitized before being assigned to innerHTML. */}
      <article
        className="markdown-body"
        ref={(el) => {
          if (el !== null) el.innerHTML = safeHtml;
        }}
      />
    </section>
  );
}
