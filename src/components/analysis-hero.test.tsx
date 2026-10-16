import path from 'path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readJsonFile = vi.fn();

vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile: vi.fn() }));

async function renderHero(fixtures: string) {
  vi.stubEnv('POLICAI_ARTICLES_DIR', path.join(process.cwd(), 'src/test/fixtures', fixtures));
  readJsonFile.mockImplementation(async (_file: string, fallback: unknown) => fallback);
  vi.resetModules();
  const { getArticles } = await import('@/lib/data-service');
  const { AnalysisHero } = await import('@/components/analysis-hero');
  return render(<AnalysisHero articles={await getArticles()} />);
}

describe('AnalysisHero', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders nothing when no piece is published', async () => {
    const { container } = await renderHero('no-articles');
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading', { name: 'Analysis' })).not.toBeInTheDocument();
  });

  it('leads with the weekly briefing and never shows drafts or withdrawn pieces', async () => {
    const { container } = await renderHero('articles');
    const hero = screen.getByRole('region', { name: 'Analysis' });
    expect(within(hero).getByRole('link', { name: 'Fixture weekly: 8–14 October 2026' })).toHaveAttribute(
      'href',
      '/analysis/fixture-weekly-published',
    );
    expect(container.innerHTML).not.toContain('Fixture explainer in draft');
    expect(container.innerHTML).not.toContain('Fixture note on a misidentified instrument');
    expect(within(hero).getByRole('link', { name: 'All analysis' })).toHaveAttribute('href', '/analysis');
    expect(within(hero).getByRole('link', { name: 'Analysis feed (Atom)' })).toHaveAttribute(
      'href',
      '/analysis/feed.xml',
    );
    expect(within(hero).queryByRole('img', { hidden: true })).not.toBeInTheDocument();
  });

  it('shows a lead image with its declared size and a type label without a pill', async () => {
    const { container } = await renderHero('articles-with-image');
    const image = screen.getByRole('img', { hidden: true });
    expect(image).toHaveAttribute('width', '2048');
    expect(image).toHaveAttribute('height', '1365');
    expect(image).toHaveAttribute('sizes', '(min-width: 1024px) 176px, (min-width: 640px) 192px, 96px');
    expect(image.closest('a')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Explainer')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('status-amended');
    expect(container.querySelector('ul')).toBeNull();
  });
});
