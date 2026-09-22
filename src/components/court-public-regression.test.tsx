import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicCourtRequirements } from '@/lib/court-requirements';
import { getPolicies } from '@/lib/data-service';
import { CourtsBrowser } from './courts-browser';
import { StatusPill } from './policy-indicators';
import type { PolicyDate, PolicyStatus } from '@/types';

beforeEach(() => {
  window.history.replaceState({}, '', '/courts');
  Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: true }) });
});

describe('public court regression evidence', () => {
  it('finds actual NSW and federal practitioner guidance using only public records', async () => {
    const [policies, requirements] = await Promise.all([getPolicies({ type: 'practice_note' }), getPublicCourtRequirements()]);
    render(<CourtsBrowser policies={policies} requirements={requirements} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by audience' }), { target: { value: 'profession' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by jurisdiction' }), { target: { value: 'nsw' } });
    fireEvent.click(screen.getByRole('button', { name: /SC Gen 23 —/ }));
    const para9A = requirements.find(r => r.policyId === 'nsw-supreme-court-sc-gen-23' && r.source.locator === 'paragraph 9A')!;
    const exception = screen.getByText(`Exception: ${para9A.exceptions[0]}`);
    expect(exception.closest('blockquote')).toBeNull();
    expect(exception).toHaveTextContent('(a)');
    expect(exception).toHaveTextContent('(b)');
    expect(exception).toHaveTextContent('(c)');
    expect(screen.getByText('Verified requirements (18)')).toBeInTheDocument();
    const article = exception.closest('article')!;
    expect(within(article).getByRole('blockquote')).toHaveTextContent(para9A.source.quote);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by jurisdiction' }), { target: { value: 'federal' } });
    expect(screen.getByRole('button', { name: /GPN-AI/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'affidavit' } });
    expect(screen.getByRole('button', { name: /GPN-AI/ })).toBeInTheDocument();
  });

  it('does not include non-lawyer actors as legal professionals', async () => {
    const policies = await getPolicies({ type: 'practice_note' });
    const requirements = await getPublicCourtRequirements({ policyId: 'qld-courts-genai-guidelines-non-lawyers' });
    render(<CourtsBrowser policies={policies.filter(p => p.id === 'qld-courts-genai-guidelines-non-lawyers')} requirements={requirements} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by audience' }), { target: { value: 'profession' } });
    expect(screen.getByText('0 of 1 instruments')).toBeInTheDocument();
  });
});

describe('commencement presentation boundaries', () => {
  it.each([
    ['active', 'effective', '2026-10-20', 'day', true],
    ['active', 'effective', '2026-09-22', 'day', false],
    ['active', 'effective', '2026-09-21', 'day', false],
    ['active', 'issued', '2026-10-20', 'day', false],
    ['active', 'commenced', '2026-10', 'month', true],
    ['active', 'commenced', '2026-09', 'month', false],
    ['active', 'commenced', '2027', 'year', true],
    ['active', 'commenced', '2026', 'year', false],
    ['superseded', 'effective', '2026-10-20', 'day', false],
    ['closed', 'effective', '2026-10-20', 'day', false],
  ] as const)('%s %s %s (%s) future=%s', (status, type, date, precision, future) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T02:00:00Z'));
    try {
      render(<StatusPill status={status as PolicyStatus} dates={[{ type, date, precision } as PolicyDate]} />);
      expect(screen.queryByText('Not yet in effect') !== null).toBe(future);
    } finally { vi.useRealTimers(); }
  });
});
