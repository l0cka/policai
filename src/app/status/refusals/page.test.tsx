import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getBodies, getSourceHealth } from '@/lib/data-service';
import RefusalsPage from './page';

vi.mock('@/lib/data-service', () => ({
  getBodies: vi.fn(),
  getSourceHealth: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
  vi.mocked(getBodies).mockResolvedValue([
    {
      id: 'aph',
      name: 'Parliament of Australia',
      jurisdiction: 'federal',
      tier: 'A',
      hosts: ['www.aph.gov.au', 'parlinfo.aph.gov.au'],
      scope: { status: 'unassessed' },
    },
  ] as unknown as Awaited<ReturnType<typeof getBodies>>);
  vi.mocked(getSourceHealth).mockResolvedValue({});
});

it('lists each refusing source with its body, how it refuses and what Policai does', async () => {
  render(await RefusalsPage());
  expect(screen.getByRole('heading', { level: 1, name: 'Sites that refuse Policai' })).toBeInTheDocument();
  const federal = screen.getByRole('region', { name: 'Sites that refuse Policai, Federal' });
  const row = within(federal).getAllByText('parlinfo.aph.gov.au')[0].closest('tr');
  expect(row).toHaveTextContent('Parliament of Australia');
  expect(row).toHaveTextContent('Tier A');
  expect(row).toHaveTextContent('Blocks automated access');
  expect(row).toHaveTextContent('22 Oct 2026');
  expect(row).toHaveTextContent('Checked by hand');
});
