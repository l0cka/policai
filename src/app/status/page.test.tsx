import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import {
  getBodies,
  getCollectionMeta,
  getPolicies,
  getSourceCheckTimes,
  getSourceHealth,
  getSourceMonitoring,
  getSourceReviews,
} from '@/lib/data-service';
import StatusPage from './page';

vi.mock('@/lib/data-service', () => ({
  getBodies: vi.fn(),
  getCollectionMeta: vi.fn(),
  getPolicies: vi.fn(),
  getSourceCheckTimes: vi.fn(),
  getSourceHealth: vi.fn(),
  getSourceMonitoring: vi.fn(),
  getSourceReviews: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: true }),
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
  vi.mocked(getCollectionMeta).mockResolvedValue({
    lastCollectedAt: '2026-09-22T08:23:23.603Z',
    lastHealthyAt: '2026-09-22T08:23:23.603Z',
    lastUsableAt: '2026-09-22T08:23:23.603Z',
    lastReviewedAt: null,
    collector: {
      runCount: 71,
      lastRunSources: [],
      lastRunErrors: [],
      health: 'healthy',
      dueSourceCount: 41,
      successfulSourceCount: 41,
      failedSourceCount: 0,
      skippedSourceCount: 22,
      successRate: 1,
      automaticSourceCount: 63,
      manualSourceCount: 1,
      sourceResults: [],
    },
  });
  vi.mocked(getPolicies).mockResolvedValue([
    buildPolicy({ id: 'p', jurisdiction: 'act' }),
  ]);
  vi.mocked(getSourceCheckTimes).mockResolvedValue({
    'act-ai-policy': '2026-07-20T12:19:40.243Z',
  });
  vi.mocked(getSourceHealth).mockResolvedValue({});
  vi.mocked(getBodies).mockResolvedValue([]);
  vi.mocked(getSourceMonitoring).mockResolvedValue({ manualReviews: [] });
  vi.mocked(getSourceReviews).mockResolvedValue([
    { discoveredAt: '2026-09-01T00:00:00.000Z' } as Awaited<
      ReturnType<typeof getSourceReviews>
    >[number],
  ]);
});
afterEach(() => vi.useRealTimers());

it('flags a source whose last completed check is stale even when the run is healthy', async () => {
  render(await StatusPage());
  expect(
    screen.getByRole('heading', { level: 1, name: 'Source status' }),
  ).toBeInTheDocument();
  const row = screen.getByText('act-ai-policy').closest('tr');
  expect(row).toHaveTextContent('Overdue');
  expect(row).toHaveTextContent('64 days');
});

it('reports the editorial queue and the jurisdiction table', async () => {
  render(await StatusPage());
  expect(
    screen.getByText(/1 detection awaiting editorial review/),
  ).toBeInTheDocument();
  expect(screen.getByText(/oldest 22 days/)).toBeInTheDocument();
  expect(getSourceReviews).toHaveBeenCalledWith({ status: 'pending_review' });
  expect(
    screen.getByRole('columnheader', { name: 'Binding instruments' }),
  ).toBeInTheDocument();
});

it('states the limit of what coverage counts mean', async () => {
  render(await StatusPage());
  expect(
    screen.getByText(/not a measure of how much Australian AI policy exists/),
  ).toBeInTheDocument();
});

it('reports record re-verification age as information, not a failure', async () => {
  const old = buildPolicy({ id: 'old' });
  old.verification.checkedAt = '2026-06-01T00:00:00.000Z';
  vi.mocked(getPolicies).mockResolvedValue([old, buildPolicy({ id: 'recent' })]);
  render(await StatusPage());
  const section = screen.getByRole('heading', { name: 'Record review' }).closest('section');
  expect(section).toHaveTextContent(
    '1 of 2 public records is due for editorial re-verification',
  );
  expect(section).toHaveTextContent('oldest review 114 days ago');
  expect(section).toHaveTextContent('every 90 days');
  expect(section).toHaveTextContent('stays published and is labelled “Review due”');
});

it.each<[label: string, robotsUnverified: string[] | undefined]>([
  ['absent', undefined],
  ['empty', []],
])('shows no robots unverified section when the list is %s', async (_label, robotsUnverified) => {
  const meta = await getCollectionMeta();
  vi.mocked(getCollectionMeta).mockResolvedValue({
    ...meta,
    collector: { ...meta.collector, ...(robotsUnverified ? { robotsUnverified } : {}) },
  });
  render(await StatusPage());
  expect(screen.queryByRole('heading', { name: 'Robots unverified' })).not.toBeInTheDocument();
});

it('names the hosts whose robots.txt has not been readable for 3 or more runs', async () => {
  const meta = await getCollectionMeta();
  vi.mocked(getCollectionMeta).mockResolvedValue({
    ...meta,
    collector: { ...meta.collector, robotsUnverified: ['www.alpha.gov.au', 'www.beta.gov.au'] },
  });
  render(await StatusPage());
  const section = screen.getByRole('heading', { name: 'Robots unverified' }).closest('section');
  expect(section).toHaveTextContent('robots.txt for these hosts has not been readable for 3 or more runs');
  expect(section).toHaveTextContent('still paces requests');
  expect(
    within(section as HTMLElement)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['www.alpha.gov.au', 'www.beta.gov.au']);
});

it('says the ledger is not built yet before the first collection writes it', async () => {
  render(await StatusPage());
  const section = screen
    .getByRole('heading', { name: 'Not reached since the last passing run' })
    .closest('section');
  expect(section).toHaveTextContent('The per-source ledger has no records yet');
  expect(section).not.toHaveTextContent('Every automatic source has been reached');
});

it('says every automatic source was reached since the last passing run', async () => {
  vi.mocked(getSourceHealth).mockResolvedValue({
    'pm-media': {
      lastSuccessAt: '2026-09-22T08:00:00.000Z',
      firstFailureAt: null,
      consecutiveFailures: 0,
      lastFailureClass: null,
    },
  });
  render(await StatusPage());
  const section = screen
    .getByRole('heading', { name: 'Not reached since the last passing run' })
    .closest('section');
  expect(section).toHaveTextContent('Last collected 22 Sept 2026. Last passing run 22 Sept 2026');
  expect(section).toHaveTextContent('Every automatic source has been reached since then.');
});

it('names the automatic sources failing since the last passing run, longest first', async () => {
  const meta = await getCollectionMeta();
  vi.mocked(getCollectionMeta).mockResolvedValue({
    ...meta,
    lastCollectedAt: '2026-09-22T08:23:23.603Z',
    lastUsableAt: '2026-09-20T08:00:00.000Z',
  });
  vi.mocked(getSourceHealth).mockResolvedValue({
    'pm-media': {
      lastSuccessAt: '2026-09-19T08:00:00.000Z',
      firstFailureAt: '2026-09-20T08:00:00.000Z',
      consecutiveFailures: 3,
      lastFailureClass: 'identity_refused',
    },
    'pmc-office-ai': {
      lastSuccessAt: '2026-09-21T08:00:00.000Z',
      firstFailureAt: '2026-09-22T08:00:00.000Z',
      consecutiveFailures: 1,
      lastFailureClass: 'timeout',
    },
    'accc-rss': {
      lastSuccessAt: null,
      firstFailureAt: '2026-09-01T08:00:00.000Z',
      consecutiveFailures: 9,
      lastFailureClass: 'identity_refused',
    },
  });
  render(await StatusPage());
  const section = screen
    .getByRole('heading', { name: 'Not reached since the last passing run' })
    .closest('section');
  expect(section).toHaveTextContent('Last passing run 20 Sept 2026');
  expect(
    within(section as HTMLElement)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual([
    'Prime Minister of Australia — media failing since 20 Sept 2026, 3 runs, identity_refused',
  ]);
});

it('lists machine feeds and API surfaces with links to methodology', async () => {
  render(await StatusPage());
  const section = screen
    .getByRole('heading', { name: 'Machine feeds and API' })
    .closest('section');
  expect(section).not.toBeNull();
  const scoped = within(section as HTMLElement);
  expect(scoped.getByRole('link', { name: '/feed.xml' })).toHaveAttribute(
    'href',
    '/feed.xml',
  );
  expect(scoped.getByRole('link', { name: '/api/policies' })).toHaveAttribute(
    'href',
    '/api/policies',
  );
  expect(
    scoped.getByRole('link', { name: '/api/developments' }),
  ).toHaveAttribute('href', '/api/developments');
  expect(scoped.getByRole('link', { name: '/api/status' })).toHaveAttribute(
    'href',
    '/api/status',
  );
  expect(scoped.getByRole('link', { name: 'methodology' })).toHaveAttribute(
    'href',
    '/methodology#machine-feeds',
  );
});

it('counts watched bodies by tier and names the tier A gaps', async () => {
  vi.mocked(getBodies).mockResolvedValue(
    [
      { id: 'act-government', name: 'ACT Government', tier: 'A' },
      { id: 'act-unwatched', name: 'ACT Unwatched Office', tier: 'A' },
    ].map((body) => ({
      ...body,
      jurisdiction: 'act',
      hosts: [],
      scope: { status: 'unassessed' },
    })) as unknown as Awaited<ReturnType<typeof getBodies>>,
  );
  render(await StatusPage());
  const table = screen.getByRole('region', { name: 'Watch coverage table' });
  const row = within(table).getByText('Australian Capital Territory').closest('tr');
  expect(row).toHaveTextContent('1 of 2');
  expect(
    screen.getByText(/Tier A bodies with no working source: ACT Unwatched Office\./),
  ).toBeInTheDocument();
});
