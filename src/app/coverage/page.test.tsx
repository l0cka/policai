import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { Jurisdiction, Policy } from '@/types';
import type { ThemeId } from '@/lib/themes';

const readJsonFile = vi.fn();
vi.mock('@/lib/file-store', () => ({ readJsonFile, writeJsonFile: vi.fn() }));

function record(id: string, jurisdiction: Jurisdiction, themes: ThemeId[], overrides: Partial<Policy> = {}): Policy {
  const sourceUrl = `https://example.gov.au/${id}`;
  return buildPolicy({ id, title: `${id} title`, jurisdiction, themes, sourceUrl, ...overrides });
}

const PUBLIC = [
  record('nsw-public-a', 'nsw', ['courts-tribunals']),
  record('nsw-public-b', 'nsw', ['courts-tribunals']),
  record('vic-public', 'vic', ['courts-tribunals', 'generative-ai']),
];

const HIDDEN = [
  record('nsw-withheld', 'nsw', ['courts-tribunals', 'privacy-data']),
  record('nsw-unverified', 'nsw', ['courts-tribunals', 'privacy-data'], {
    verification: { ...buildPolicy().verification, status: 'needs_review' },
  }),
  record('nsw-trashed', 'nsw', ['courts-tribunals', 'privacy-data'], { status: 'trashed' }),
];

const WITHHOLDING_REVIEW = {
  id: 'review-1',
  status: 'pending_review',
  entryKind: 'policy',
  targetPolicyId: 'nsw-withheld',
  sourceUrl: 'https://example.gov.au/nsw-withheld',
  title: 'Changed source',
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  readJsonFile.mockImplementation(async (file: string, fallback: unknown) => {
    if (file.endsWith('policies.json')) return [...PUBLIC, ...HIDDEN];
    if (file.endsWith('source-reviews.json')) return [WITHHOLDING_REVIEW];
    return fallback;
  });
});

async function coveragePage() {
  const { default: CoveragePage } = await import('./page');
  return CoveragePage();
}

describe('/coverage page', () => {
  it('counts only public records, so withheld, unverified and trashed records never reach a cell or a list (#330)', async () => {
    window.history.replaceState({}, '', '/coverage?theme=courts-tribunals&j=nsw');
    render(await coveragePage());

    expect(screen.getAllByRole('rowheader').map((head) => head.textContent)).toEqual(['Courts and tribunals', 'Generative AI']);
    expect(screen.getByRole('button', { name: 'Courts and tribunals, New South Wales: 2 records' })).toBeInTheDocument();
    const courts = screen.getByRole('button', { name: 'Courts and tribunals' }).closest('tr')!;
    expect(courts.querySelector('.coverage-total')?.firstChild?.textContent).toBe('3');

    const region = screen.getByRole('region', { name: /Courts and tribunals · New South Wales 2 records/ });
    expect(within(region).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/policies/nsw-public-a',
      '/policies/nsw-public-b',
    ]);
    expect(document.body.textContent).not.toMatch(/withheld|unverified|trashed/);
    expect(screen.getByText(/3 of 3 records/)).toBeInTheDocument();
    window.history.replaceState({}, '', '/');
  });

  it('server-renders the table, its headers and caption without JavaScript (#330)', async () => {
    const markup = renderToStaticMarkup(await coveragePage());
    const html = new DOMParser().parseFromString(markup, 'text/html');
    const table = html.querySelectorAll('table');
    expect(table).toHaveLength(1);
    expect(table[0].querySelector('caption')?.textContent).toMatch(/^Verified register records by theme and jurisdiction\./);
    expect(table[0].querySelectorAll('thead th[scope="col"]')).toHaveLength(11);
    expect([...table[0].querySelectorAll('tbody th[scope="row"]')].map((head) => head.textContent)).toEqual([
      'Courts and tribunals',
      'Generative AI',
    ]);
    const rows = table[0].querySelectorAll('tbody tr.coverage-row');
    expect([...rows].map((row) => row.querySelectorAll('td').length)).toEqual([10, 10]);
    expect([...rows].map((row) => [...row.querySelectorAll('td.coverage-cell')].map((cell) => cell.querySelector('button')?.textContent ?? '0'))).toEqual([
      ['0', '2', '1', '0', '0', '0', '0', '0', '0'],
      ['0', '0', '1', '0', '0', '0', '0', '0', '0'],
    ]);
  });

  it('prerenders, so a first visit is a static file; the map reads the query string after hydration', async () => {
    const page = await import('./page');
    expect('dynamic' in page).toBe(false);
  });
});
