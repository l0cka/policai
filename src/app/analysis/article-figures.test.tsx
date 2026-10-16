import path from 'path';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { Policy, SourceReview } from '@/types';

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

const CITED = {
  'nsw-identifying-ai-guidance': 'Identifying AI',
  'fwc-genai-guidance-note': 'FWC guidance note',
  'oaic-app-1-7-adm-transparency-guidance': 'OAIC transparency guidance',
  'federal-court-gpn-ai': 'GPN-AI',
  'nsw-supreme-court-sc-gen-23': 'SC Gen 23',
  'nsw-ai-operational-policy': 'NSW AI Operational Policy',
  'nsw-artificial-intelligence-assessment-framework': 'NSW AI Assessment Framework',
};

const cited = Object.entries(CITED).map(([id, title]) => buildPolicy({ id, title }));

function serve(policies: Policy[], reviews: Partial<SourceReview>[] = []) {
  readJsonFile.mockImplementation(async (file: string, fallback: unknown) => {
    if (file.endsWith('policies.json')) return policies;
    if (file.endsWith('source-reviews.json')) return reviews;
    return fallback;
  });
}

async function renderArticle(slug: string) {
  vi.resetModules();
  const { default: ArticlePage } = await import('./[slug]/page');
  render(await ArticlePage({ params: Promise.resolve({ slug }) }));
}

function figureByLabel(label: string): HTMLElement {
  const figure = screen.getByText(label).closest('figure');
  if (!figure) throw new Error(`no figure labelled ${label}`);
  return figure;
}

describe('figures in an analysis piece', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    vi.stubEnv('POLICAI_ARTICLES_DIR', path.join(process.cwd(), 'src/test/fixtures/articles'));
    serve(cited);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('renders each figure between the prose with its frame in order and per-piece numbers', async () => {
    await renderArticle('figure-kinds-published');
    const figures = screen.getAllByRole('figure');
    expect(figures.map((figure) => figure.querySelector('.figure-label')?.textContent)).toEqual([
      'Figure 1 · Timeline',
      'Figure 2 · Comparison',
      'Figure 3 · Process',
      'Figure 4 · Chart',
    ]);
    const timeline = figures[0];
    expect(timeline).toHaveAccessibleName('Four dates fall between now and the end of the year');
    expect(timeline).toHaveAccessibleDescription(/^Four dates: the NSW AIAF Platform requirement began on 30 September/);
    const visible = Array.from(timeline.children).filter((child) => !child.classList.contains('sr-only'));
    expect(visible.map((child) => child.className)).toEqual(['figure-label', 'figure-title', 'figure-body', 'figure-caption']);
    const caption = timeline.querySelector('figcaption');
    expect(Array.from(caption?.children ?? []).map((child) => child.className)).toEqual(['figure-caption-text', 'figure-sources']);
    const bodies = screen.getAllByTestId('body');
    expect(bodies[0].compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timeline.compareDocumentPosition(bodies[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const figure of figures) {
      expect(figure.querySelector('svg, canvas, img')).toBeNull();
    }
  });

  it('marks timeline dates after the data date as not yet in effect', async () => {
    await renderArticle('figure-kinds-published');
    const entries = within(figureByLabel('Figure 1 · Timeline')).getAllByRole('listitem');
    expect(entries.map((entry) => [entry.querySelector('time')?.getAttribute('dateTime'), entry.dataset.state])).toEqual([
      ['2026-09-30', 'past'],
      ['2026-10-20', 'upcoming'],
      ['2026-11-16', 'upcoming'],
      ['2026-12-10', 'upcoming'],
    ]);
    expect(entries[0].querySelector('.figure-timeline-marker')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the comparison as a table with scoped headers, labels for phones and Not stated cells', async () => {
    await renderArticle('figure-kinds-published');
    const figure = figureByLabel('Figure 2 · Comparison');
    expect(figure).toHaveClass('figure-wide');
    const table = within(figure).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => [cell.textContent, cell.getAttribute('scope')])).toEqual([
      ['Court', 'col'],
      ['Instrument', 'col'],
      ['Who it covers', 'col'],
      ['What it requires', 'col'],
    ]);
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
      'Federal Court',
      'Supreme Court of NSW',
      'Fair Work Commission',
    ]);
    const notStated = within(table).getByText('Not stated');
    expect(notStated).toHaveAttribute('data-label', 'Who it covers');
    expect(within(table).getByText(/^No generative AI/)).toHaveAttribute('data-emphasis', 'true');
  });

  it('renders the process as ordered steps with the branch labelled in text', async () => {
    await renderArticle('figure-kinds-published');
    const figure = figureByLabel('Figure 3 · Process');
    const [main, branch] = within(figure).getAllByRole('list');
    expect(within(main).getAllByRole('listitem').map((step) => step.dataset.role)).toEqual(['decision', 'step', 'step', 'end']);
    expect(within(main).getByText('Yes to any AI question')).toBeInTheDocument();
    expect(within(figure).getByText('Yes to all non-AI questions')).toBeInTheDocument();
    expect(within(branch).getAllByRole('listitem')).toHaveLength(1);
    expect(branch).toHaveAttribute('start', '5');
  });

  it('links cited records by title and official sources by host on the source line', async () => {
    await renderArticle('figure-kinds-published');
    const sources = figureByLabel('Figure 2 · Comparison').querySelector('.figure-sources') as HTMLElement;
    expect(within(sources).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['GPN-AI', '/policies/federal-court-gpn-ai'],
      ['SC Gen 23', '/policies/nsw-supreme-court-sc-gen-23'],
      ['FWC guidance note', '/policies/fwc-genai-guidance-note'],
      ['fwc.gov.au', 'https://www.fwc.gov.au/documents/resources/guidance-note-use-of-generative-ai-in-commission-cases.pdf'],
      ['oaic.gov.au', 'https://www.oaic.gov.au/__data/assets/pdf_file/0021/269013/APP-1.7-1.9-Transparency-Obligation-Fact-Sheet.PDF'],
      ['aph.gov.au', 'https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Environment_and_Communications/AIdatacentres48P'],
    ]);
    expect(within(sources).getByRole('link', { name: 'aph.gov.au' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Source under review')).not.toBeInTheDocument();
  });

  it('shows the piece banner when a record a figure cites is withheld, and keeps the figure', async () => {
    const withheld = buildPolicy({ id: 'fixture-withheld', title: 'Withheld instrument' });
    serve([withheld], [
      {
        id: 'review-withheld',
        status: 'pending_review',
        targetPolicyId: 'fixture-withheld',
        sourceUrl: withheld.sourceUrl,
      },
    ]);
    await renderArticle('figure-citation-withheld');
    expect(screen.getByRole('status')).toHaveTextContent('Source under review');
    const figure = figureByLabel('Figure 1 · Timeline');
    expect(within(figure).getByText('Register record under review')).toBeInTheDocument();
    expect(within(figure).queryByRole('link')).toBeNull();
  });
});
