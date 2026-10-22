import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import { getPolicies } from '@/lib/data-service';
import LegislationPage from './page';

vi.mock('@/lib/data-service', () => ({ getPolicies: vi.fn() }));

const source = { url: 'https://www.aph.gov.au/bill' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T02:00:00Z'));
  vi.mocked(getPolicies).mockResolvedValue([
    buildPolicy({
      id: 'my-face',
      title: 'My Face, My Rights Bill 2025',
      type: 'legislation',
      legislative: {
        kind: 'bill',
        ref: { register: 'aph', billId: 's1471' },
        origin: 'private_member',
        events: [{ date: '2025-11-24', precision: 'day', event: { kind: 'introduced', chamber: 'upper' }, source }],
      },
    }),
    buildPolicy({
      id: 'asic-rules',
      title: 'ASIC Market Integrity Rules',
      type: 'regulation',
      status: 'active',
      dates: [{ type: 'commenced', date: '2028-03-18', precision: 'day' }],
      legislative: {
        kind: 'instrument',
        ref: { register: 'frl', titleId: 'F2026L01223' },
        issuerBodyId: 'asic',
        enablingAct: 'Corporations Act 2001',
        events: [{ date: '2026-09-17', precision: 'day', event: { kind: 'registered' }, source }],
      },
    }),
    buildPolicy({ id: 'guideline', title: 'A guideline' }),
  ]);
});
afterEach(() => vi.useRealTimers());

it('shows bills before Parliament, upcoming dates and recently made instruments', async () => {
  render(await LegislationPage());
  const before = screen.getByRole('region', { name: 'Before Parliament 1' });
  expect(within(before).getByRole('link', { name: 'My Face, My Rights Bill 2025' })).toHaveAttribute('href', '/policies/my-face');
  expect(within(before).getByText('Introduced in the Senate')).toBeInTheDocument();
  expect(within(before).getByText('Passed 0 of 2 chambers')).toBeInTheDocument();

  const coming = screen.getByRole('region', { name: 'Coming up 1' });
  expect(within(coming).getByText(/Scheduled commencement/)).toBeInTheDocument();
  expect(within(coming).getByRole('link', { name: 'ASIC Market Integrity Rules' })).toBeInTheDocument();

  const made = screen.getByRole('region', { name: 'Recently made 1' });
  expect(within(made).getByText(/Registered on the Federal Register of Legislation/)).toBeInTheDocument();
  expect(screen.queryByText('A guideline')).not.toBeInTheDocument();
});

it('says plainly when a section is empty', async () => {
  vi.mocked(getPolicies).mockResolvedValue([]);
  render(await LegislationPage());
  expect(screen.getByText('No AI-related bill in the register is before a Parliament.')).toBeInTheDocument();
});
