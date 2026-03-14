import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownPage } from '../src/MarkdownPage';

afterEach(cleanup);

describe('MarkdownPage', () => {
  it('renders markdown as HTML and shows back button', () => {
    const onBack = vi.fn();
    const { container } = render(<MarkdownPage markdown={'# Hello\n\nSome **bold** text.'} onBack={onBack} />);

    const article = container.querySelector('.markdown-body');
    expect(article?.innerHTML).toContain('<h1>Hello</h1>');
    expect(article?.innerHTML).toContain('<strong>bold</strong>');

    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders GFM tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const { container } = render(<MarkdownPage markdown={md} onBack={() => {}} />);

    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelectorAll('td').length).toBe(2);
  });
});
