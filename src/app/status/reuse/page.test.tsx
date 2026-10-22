import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getBodies, getSiteReuse } from '@/lib/data-service';
import { parseSiteReuse } from '@/lib/watch-coverage/site-reuse';
import ReusePage from './page';

vi.mock('@/lib/data-service', () => ({
  getBodies: vi.fn(),
  getSiteReuse: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
  vi.mocked(getBodies).mockResolvedValue([
    {
      id: 'oaic',
      name: 'Office of the Australian Information Commissioner',
      jurisdiction: 'federal',
      tier: 'A',
      hosts: ['www.oaic.gov.au', 'www.example.gov.au'],
      scope: { status: 'unassessed' },
    },
    {
      id: 'nt-supreme-court',
      name: 'Supreme Court of the Northern Territory',
      jurisdiction: 'nt',
      tier: 'B',
      hosts: ['supremecourt.nt.gov.au'],
      scope: { status: 'unassessed' },
    },
  ] as unknown as Awaited<ReturnType<typeof getBodies>>);
  vi.mocked(getSiteReuse).mockResolvedValue(
    parseSiteReuse([
      {
        host: 'www.oaic.gov.au',
        status: 'stated',
        terms: { kind: 'creative_commons', licence: 'CC-BY-4.0', exceptions: 'the Coat of Arms and logos' },
        termsUrl: 'https://www.oaic.gov.au/copyright',
        checkedAt: '2026-10-22',
      },
      {
        host: 'supremecourt.nt.gov.au',
        status: 'refused',
        note: 'Bot challenge on every page',
        checkedAt: '2026-10-22',
      },
    ]),
  );
});

it('shows each site’s terms, its copyright page and when it was checked', async () => {
  render(await ReusePage());
  expect(screen.getByRole('heading', { level: 1, name: 'Reuse terms of official sites' })).toBeInTheDocument();

  const federal = screen.getByRole('region', { name: 'Reuse terms, Federal' });
  const oaic = within(federal).getByRole('link', { name: 'www.oaic.gov.au' });
  expect(oaic).toHaveAttribute('href', 'https://www.oaic.gov.au/copyright');
  const row = oaic.closest('tr')!;
  expect(within(row).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
  expect(row).toHaveTextContent('Except the Coat of Arms and logos');
  expect(row).toHaveTextContent('22 Oct 2026');
  expect(within(federal).getByText('www.example.gov.au').closest('tr')).toHaveTextContent('Not yet checked');

  const nt = screen.getByRole('region', { name: 'Reuse terms, Northern Territory' });
  expect(within(nt).getByText('supremecourt.nt.gov.au').closest('tr')).toHaveTextContent(
    'Not checked: site refuses PolicaiBot challenge on every page',
  );
});
