import { useMemo } from 'react';
import { Marked } from 'marked';
import markedAlert from 'marked-alert';

const md = new Marked({ gfm: true }).use(markedAlert());

export interface MarkdownPageProps {
  markdown: string;
  onBack: () => void;
}

export function MarkdownPage({ markdown, onBack }: MarkdownPageProps) {
  // Markdown source is inlined at build time from docs/*.md - trusted content.
  const html = useMemo(() => md.parse(markdown, { async: false }) as string, [markdown]);

  return (
    <section className="markdown-page">
      <nav className="markdown-nav">
        <button type="button" className="results-nav-action" onClick={onBack}>
          <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          Back
        </button>
      </nav>
      <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
