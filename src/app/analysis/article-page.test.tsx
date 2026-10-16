import path from 'path';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { ARTICLE_DISCLOSURE, ARTICLE_NOTICE } from '@/lib/articles';
import type { Policy } from '@/types';

const readJsonFile = vi.fn();

vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile: vi.fn() }));
vi.mock('next-mdx-remote/rsc', () => ({
  MDXRemote: ({ source }: { source: string }) => <div data-testid="body">{source}</div>,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const cited = buildPolicy({ id: 'fixture-current', title: 'Fixture instrument' });
const reviewDue = buildPolicy({
  id: 'fixture-review-due',
  title: 'Review-due instrument',
  verification: { ...cited.verification, checkedAt: '2026-01-01T00:00:00.000Z' },
});

function serve(policies: Policy[]) {
  readJsonFile.mockImplementation(async (file: string, fallback: unknown) =>
    file.endsWith('policies.json') ? policies : fallback,
  );
}

async function renderArticle(slug: string) {
  vi.resetModules();
  const { default: ArticlePage } = await import('./[slug]/page');
  render(await ArticlePage({ params: Promise.resolve({ slug }) }));
}

describe('analysis article page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    vi.stubEnv('POLICAI_ARTICLES_DIR', path.join(process.cwd(), 'src/test/fixtures/articles'));
    serve([cited, reviewDue]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('renders the tier label, byline, disclosure and notice on every published piece', async () => {
    vi.resetModules();
    const { getArticles } = await import('@/lib/data-service');
    const published = await getArticles();
    expect(published.length).toBeGreaterThan(0);
    for (const article of published) {
      document.body.innerHTML = '';
      await renderArticle(article.slug);
      expect(screen.getByText('Analysis', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getAllByText('By Policai').length).toBeGreaterThan(0);
      expect(screen.getByText(ARTICLE_DISCLOSURE)).toBeInTheDocument();
      expect(screen.getByText(ARTICLE_NOTICE)).toBeInTheDocument();
    }
  });

  it('lists dated corrections and links current citations', async () => {
    await renderArticle('fixture-weekly-published');
    expect(screen.getByRole('heading', { name: 'Corrections and updates' })).toBeInTheDocument();
    expect(screen.getByText(/first gave the wrong issuer/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fixture instrument' })).toHaveAttribute('href', '/policies/fixture-current');
    expect(screen.queryByText('Source under review')).not.toBeInTheDocument();
  });

  it('shows the Source under review banner for a review-due citation', async () => {
    await renderArticle('citation-review-due');
    expect(screen.getByRole('status')).toHaveTextContent('Source under review');
    expect(screen.getByText('Review due')).toBeInTheDocument();
  });

  it('shows the banner without a link for a withheld citation', async () => {
    await renderArticle('citation-withheld');
    expect(screen.getByRole('status')).toHaveTextContent('Source under review');
    expect(screen.getByText('Register record under review')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /withheld/i })).not.toBeInTheDocument();
  });

  it('renders a tombstone for a withdrawn piece without its body or notices', async () => {
    await renderArticle('fixture-note-withdrawn');
    expect(screen.getByRole('status')).toHaveTextContent('Withdrawn on 10 October 2026');
    expect(screen.getByRole('status')).toHaveTextContent('The note described a different instrument from the one it cited.');
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('never renders a draft', async () => {
    await expect(renderArticle('fixture-explainer-draft')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
