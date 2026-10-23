import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYSIS_HERO_INTERVAL_MS } from '@/lib/analysis-hero';

const readJsonFile = vi.fn();

vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile: vi.fn() }));

function mockMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

async function renderHero(fixtures: string) {
  vi.stubEnv('POLICAI_ARTICLES_DIR', path.join(process.cwd(), 'src/test/fixtures', fixtures));
  readJsonFile.mockImplementation(async (_file: string, fallback: unknown) => fallback);
  vi.resetModules();
  const { getArticles } = await import('@/lib/data-service');
  const { AnalysisHero } = await import('@/components/analysis-hero');
  const articles = await getArticles();
  const view = render(<AnalysisHero articles={articles} />);
  return { ...view, articles };
}

describe('AnalysisHero', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockMotion(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders nothing when no piece is published', async () => {
    const { container } = await renderHero('no-articles');
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Analysis' })).not.toBeInTheDocument();
  });

  it('leaves the page outline to the register, so the carousel adds no headings', async () => {
    await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });
    expect(within(hero).queryAllByRole('heading')).toHaveLength(0);
  });

  it('shows the newest published piece first and keeps drafts and withdrawn pieces out', async () => {
    const { container, articles } = await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });
    const lead = articles[0];
    expect(within(hero).getByRole('link', { name: lead.title })).toHaveAttribute(
      'href',
      `/analysis/${lead.slug}`,
    );
    expect(within(hero).getByRole('link', { name: 'Read this piece' })).toHaveAttribute(
      'href',
      `/analysis/${lead.slug}`,
    );
    expect(within(hero).getByText(lead.summary)).toHaveClass('analysis-hero-teaser');
    expect(hero.querySelector('.analysis-hero-count')).toHaveTextContent(`Showing article 1 of ${articles.length}`);
    expect(within(hero).queryByText('By Policai')).not.toBeInTheDocument();
    expect(container.innerHTML).toContain('Fixture weekly: 8–14 October 2026');
    expect(container.innerHTML).not.toContain('Fixture explainer in draft');
    expect(container.innerHTML).not.toContain('Fixture note on a misidentified instrument');
    expect(within(hero).getByRole('link', { name: 'All analysis' })).toHaveAttribute('href', '/analysis');
    expect(within(hero).getByRole('link', { name: 'Analysis feed (Atom)' })).toHaveAttribute(
      'href',
      '/analysis/feed.xml',
    );
  });

  it('moves to the next and previous article and says which one is showing', async () => {
    const { articles } = await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });
    fireEvent.click(within(hero).getByRole('button', { name: 'Next article' }));
    expect(within(hero).getByRole('link', { name: articles[1].title })).toBeInTheDocument();
    expect(within(hero).queryByRole('link', { name: articles[0].title })).not.toBeInTheDocument();
    expect(hero.querySelector('.analysis-hero-count')).toHaveTextContent(`Showing article 2 of ${articles.length}`);
    expect(within(hero).getByRole('status')).toHaveTextContent(articles[1].title);

    fireEvent.click(within(hero).getByRole('button', { name: 'Previous article' }));
    expect(within(hero).getByRole('link', { name: articles[0].title })).toBeInTheDocument();
    expect(hero.querySelector('.analysis-hero-count')).toHaveTextContent(`Showing article 1 of ${articles.length}`);

    fireEvent.click(within(hero).getByRole('button', { name: 'Previous article' }));
    const last = articles[articles.length - 1];
    expect(within(hero).getByRole('link', { name: last.title })).toBeInTheDocument();
    expect(hero.querySelector('.analysis-hero-count')).toHaveTextContent(`Showing article ${articles.length} of ${articles.length}`);
  });

  it('jumps to an article from the progress line and marks the ones already shown', async () => {
    const { articles } = await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });
    const segments = within(within(hero).getByRole('group', { name: 'Articles' })).getAllByRole('button');
    expect(segments).toHaveLength(articles.length);

    fireEvent.click(segments[2]);
    expect(within(hero).getByRole('link', { name: articles[2].title })).toBeInTheDocument();
    expect(segments[2]).toHaveAttribute('aria-current', 'true');
    expect(segments[0]).toHaveAttribute('data-state', 'seen');
    expect(segments[3]).toHaveAttribute('data-state', 'ahead');
  });

  it('advances on its own, and pauses while the pointer is over it or a control is focused', async () => {
    vi.useFakeTimers();
    const { articles } = await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYSIS_HERO_INTERVAL_MS);
    });
    expect(within(hero).getByRole('link', { name: articles[1].title })).toBeInTheDocument();

    fireEvent.pointerEnter(hero);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYSIS_HERO_INTERVAL_MS * 2);
    });
    expect(within(hero).getByRole('link', { name: articles[1].title })).toBeInTheDocument();

    fireEvent.pointerLeave(hero);
    const next = within(hero).getByRole('button', { name: 'Next article' });
    next.focus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYSIS_HERO_INTERVAL_MS * 2);
    });
    expect(within(hero).getByRole('link', { name: articles[1].title })).toBeInTheDocument();

    fireEvent.blur(next, { relatedTarget: document.body });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYSIS_HERO_INTERVAL_MS);
    });
    expect(within(hero).getByRole('link', { name: articles[2].title })).toBeInTheDocument();
  });

  it('does not autoplay when reduced motion is requested', async () => {
    mockMotion(true);
    vi.useFakeTimers();
    const { articles } = await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ANALYSIS_HERO_INTERVAL_MS * 3);
    });
    expect(within(hero).getByRole('link', { name: articles[0].title })).toBeInTheDocument();
    expect(hero).toHaveAttribute('data-reduced-motion', 'true');

    fireEvent.click(within(hero).getByRole('button', { name: 'Next article' }));
    expect(within(hero).getByRole('link', { name: articles[1].title })).toBeInTheDocument();
  });

  it('shows a lead image with its declared size and a type label without a pill', async () => {
    const { container } = await renderHero('articles-with-image');
    const image = screen.getByRole('img', { hidden: true });
    expect(image).toHaveAttribute('width', '2048');
    expect(image).toHaveAttribute('height', '1365');
    expect(image).toHaveAttribute('sizes', '(min-width: 64rem) 208px, 176px');
    expect(image.closest('.analysis-hero-figure')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Explainer')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('status-amended');
    expect(screen.queryByRole('button', { name: 'Next article' })).not.toBeInTheDocument();
  });

  it('stays compact and crossfades, with reduced motion turning the transition off', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const motion = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    const dither = fs.readFileSync(
      path.join(process.cwd(), 'public/images/analysis-hero-dither.svg'),
      'utf8',
    );
    expect(css).toContain('.analysis-hero-teaser');
    expect(css).toContain('clamp(1.3rem, 1rem + 1.1vw, 1.9rem)');
    expect(css).not.toContain('min-height: clamp(20rem, 46vh, 32rem)');
    expect(css).toContain("url('/images/analysis-hero-dither.svg')");
    expect(css).toContain('analysis-hero::before');
    expect(dither).toContain('shape-rendering="crispEdges"');
    expect(css).toContain('opacity calc(var(--dur-slow) * 2) var(--ease-out-quint)');
    expect(motion).toContain('.analysis-hero-slide');
    expect(motion).toContain('transition: none !important');
    expect(motion).toContain('transform: none !important');
    expect(motion).not.toMatch(/\.analysis-hero::before[\s\S]*animation/);
  });
});
