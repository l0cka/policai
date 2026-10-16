import path from 'path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';

const readJsonFile = vi.fn();

vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile: vi.fn() }));
vi.mock('next-mdx-remote/rsc', () => ({
  MDXRemote: ({ source }: { source: string }) => <div>{source}</div>,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const SLUG = 'fixture-illustrated';
const SRC = `/images/articles/${SLUG}/lead.jpg`;

describe('article images', () => {
  beforeEach(() => {
    vi.stubEnv('POLICAI_ARTICLES_DIR', path.join(process.cwd(), 'src/test/fixtures/articles-with-image'));
    const policy = buildPolicy({ id: 'fixture-current' });
    readJsonFile.mockImplementation(async (file: string, fallback: unknown) =>
      file.endsWith('policies.json') ? [policy] : fallback,
    );
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the lead image with explicit size and a TASL attribution', async () => {
    const { default: ArticlePage } = await import('./[slug]/page');
    render(await ArticlePage({ params: Promise.resolve({ slug: SLUG }) }));

    const image = screen.getByRole('img', { name: 'A fixture courtroom with an empty bench' });
    expect(image).toHaveAttribute('width', '2048');
    expect(image).toHaveAttribute('height', '1365');
    expect(image).toHaveAttribute('sizes', '(min-width: 768px) 768px, 100vw');
    expect(image.getAttribute('src')).toContain(encodeURIComponent(SRC));

    const caption = within(image.closest('figure') as HTMLElement).getByText(/licensed under/).parentElement as HTMLElement;
    expect(caption).toHaveTextContent(
      'Fixture courtroom by Jane Citizen, licensed under CC BY-SA 4.0. Modified: cropped.',
    );
    const hrefs = within(caption).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      'https://commons.wikimedia.org/wiki/File:Fixture_courtroom.jpg',
      'https://commons.wikimedia.org/wiki/User:Jane',
      'https://creativecommons.org/licenses/by-sa/4.0/',
    ]);
  });

  it('uses the image for og:image and the Article JSON-LD', async () => {
    const { generateMetadata, default: ArticlePage } = await import('./[slug]/page');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: SLUG }) });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: `https://policai.org${SRC}`,
        width: 2048,
        height: 1365,
        alt: 'A fixture courtroom with an empty bench',
      },
    ]);

    const { container } = render(await ArticlePage({ params: Promise.resolve({ slug: SLUG }) }));
    const jsonLd = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    );
    expect(jsonLd.image).toEqual({
      '@type': 'ImageObject',
      url: `https://policai.org${SRC}`,
      width: 2048,
      height: 1365,
      caption: 'A fixture courtroom with an empty bench',
      license: 'https://creativecommons.org/licenses/by-sa/4.0/',
      creditText: 'Fixture courtroom by Jane Citizen',
      acquireLicensePage: 'https://commons.wikimedia.org/wiki/File:Fixture_courtroom.jpg',
    });
  });

  it('shows a thumbnail on the index', async () => {
    const { default: AnalysisPage } = await import('./page');
    render(await AnalysisPage({ searchParams: Promise.resolve({}) }));
    const image = screen.getByRole('img', { hidden: true });
    expect(image).toHaveAttribute('width', '2048');
    expect(image).toHaveAttribute('height', '1365');
    expect(image).toHaveAttribute('sizes', '(min-width: 640px) 160px, 256px');
  });

  it.each([
    ['PDM-1.0', 'https://creativecommons.org/publicdomain/mark/1.0/', 'Archive photo by State Records NSW, marked with Public Domain Mark 1.0.'],
    ['CC0-1.0', 'https://creativecommons.org/publicdomain/zero/1.0/', 'Archive photo by State Records NSW, dedicated to the public domain under CC0 1.0.'],
    ['CC-BY-3.0-AU', 'https://creativecommons.org/licenses/by/3.0/au/', 'Archive photo by State Records NSW, licensed under CC BY 3.0 AU.'],
  ] as const)('words the %s attribution for what it is', async (licence, licenceUrl, text) => {
    const { ArticleImageAttribution } = await import('@/components/analysis');
    const { container } = render(
      <p>
        <ArticleImageAttribution
          image={{
            src: SRC,
            alt: 'An archive photo',
            width: 2048,
            height: 1365,
            title: 'Archive photo',
            creator: 'State Records NSW',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:Archive.jpg',
            licence,
            licenceUrl,
            licenceCheckedAt: '2026-10-16',
          }}
        />
      </p>,
    );
    expect(container).toHaveTextContent(text);
    expect(within(container).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'https://commons.wikimedia.org/wiki/File:Archive.jpg',
      licenceUrl,
    ]);
  });
});
