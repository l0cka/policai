import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { Policy, SourceReview } from '@/types';
import { aphBillPage, followLegislation, followTargets } from './follow';
import type { Legislative } from './model';

const fixture = (billId: string) => readFileSync(join(__dirname, '__fixtures__/aph', `${billId}.html`), 'utf8');

function bill(billId: string, events: Legislative['events']): Policy {
  return buildPolicy({
    id: `bill-${billId}`,
    title: `Bill ${billId}`,
    type: 'legislation',
    status: 'proposed',
    sourceUrl: aphBillPage(billId),
    legislative: {
      kind: 'bill',
      ref: { register: 'aph', billId },
      origin: 'government',
      events: events as Extract<Legislative, { kind: 'bill' }>['events'],
    },
  });
}

const introduced = (date: string, chamber: 'lower' | 'upper', billId: string) => ({
  date,
  precision: 'day' as const,
  event: { kind: 'introduced' as const, chamber },
  source: { url: aphBillPage(billId), title: 'Bill home page' },
});

const now = new Date('2026-10-22T05:00:00Z');
const retrieveFixture = (billId: string) => async (url: string) => ({
  body: fixture(billId),
  evidence: { url, retrievedAt: now.toISOString(), contentHash: 'a'.repeat(64) },
});

describe('followTargets', () => {
  it('follows APH bills whose source is their bill page, not trashed records or other registers', () => {
    const targets = followTargets([
      bill('r7553', [introduced('2026-10-15', 'lower', 'r7553')]),
      { ...bill('s1471', []), status: 'trashed' },
      { ...bill('r7537', []), sourceUrl: 'https://www.aph.gov.au/elsewhere' },
      buildPolicy({ id: 'guideline' }),
    ]);
    expect(targets.map((target) => [target.sourceId, target.url])).toEqual([
      ['track:bill-r7553', aphBillPage('r7553')],
    ]);
  });
});

describe('followLegislation', () => {
  it('stages one update review with the new stages and the derived status', async () => {
    const record = bill('r7249', [introduced('2024-09-12', 'lower', 'r7249')]);
    const { reviews, errors } = await followLegislation({
      targets: followTargets([record]),
      existingReviews: [],
      retrieve: retrieveFixture('r7249'),
      now,
    });
    expect(errors).toEqual([]);
    expect(reviews).toHaveLength(1);
    const [review] = reviews;
    expect(review).toMatchObject({
      targetPolicyId: record.id,
      sourceUrl: record.sourceUrl,
      status: 'pending_review',
      createdBy: 'collector',
    });
    expect(review.legislativeUpdate?.added.map(({ event }) => event.kind)).toEqual([
      'referred', 'passed', 'reported', 'passed', 'assented',
    ]);
    expect(review.proposedRecord).toMatchObject({ id: record.id, status: 'active' });
    expect(review.proposedRecord).not.toHaveProperty('verification');
    expect(review.notes).toContain('Passed the Senate on 28 November 2024');
  });

  it('stages nothing when the page shows no new stage', async () => {
    const record = bill('s1471', [introduced('2025-11-24', 'upper', 's1471')]);
    const result = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve: retrieveFixture('s1471'), now });
    expect(result).toMatchObject({ reviews: [], errors: [], results: [{ sourceId: 'track:bill-s1471', status: 'success' }] });
  });

  it('asks a reviewer about a stage it cannot map instead of guessing', async () => {
    const page = (await import('./aph-progress')).parseAphProgress(fixture('r7239'), { url: aphBillPage('r7239') });
    const record = bill('r7239', page.events);
    const { reviews } = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve: retrieveFixture('r7239'), now });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].legislativeUpdate).toEqual({
      added: [],
      unrecognised: [{ chamber: 'upper', stage: 'Discharged from Notice Paper', date: '2024-11-25' }],
    });
    expect(reviews[0].notes).toContain('"Discharged from Notice Paper" on 25 November 2024');
  });

  it('waits while an update is undecided, and never restages a decided one', async () => {
    const record = bill('r7249', [introduced('2024-09-12', 'lower', 'r7249')]);
    const first = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve: retrieveFixture('r7249'), now });
    const pending = first.reviews[0];
    const retrieve = vi.fn(retrieveFixture('r7249'));
    expect((await followLegislation({ targets: followTargets([record]), existingReviews: [pending], retrieve, now })).reviews).toEqual([]);
    expect(retrieve).not.toHaveBeenCalled();
    const rejected: SourceReview = { ...pending, status: 'rejected' };
    expect((await followLegislation({ targets: followTargets([record]), existingReviews: [rejected], retrieve, now })).reviews).toEqual([]);
  });

  it('reports a page with no Progress stages as a failure, so a markup change is not silent', async () => {
    const record = bill('r7553', [introduced('2026-10-15', 'lower', 'r7553')]);
    const { reviews, errors, results } = await followLegislation({
      targets: followTargets([record]),
      existingReviews: [],
      retrieve: async (url) => ({ body: '<html><h1>Access denied</h1></html>', evidence: { url } }),
      now,
    });
    expect(reviews).toEqual([]);
    expect(results).toMatchObject([{ sourceId: 'track:bill-r7553', status: 'error', failureClass: 'parse' }]);
    expect(errors).toEqual(['track:bill-r7553: the bill page has no Progress stages; its markup may have changed']);
  });
});

describe('a staged stage update under validate:data', () => {
  it('passes, and the flag that keeps a record public is refused on any other review', async () => {
    const { validateSourceReviews } = await import('@/lib/validate-data');
    const record = bill('r7249', [introduced('2024-09-12', 'lower', 'r7249')]);
    const { reviews } = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve: retrieveFixture('r7249'), now });
    const context = { policies: [record], timelineEvents: [] };
    expect(validateSourceReviews(reviews, context).errors).toEqual([]);

    const plain = buildPolicy({ id: 'plain' });
    const smuggled: SourceReview = { ...reviews[0], targetPolicyId: plain.id, sourceUrl: plain.sourceUrl, sourceEvidence: { url: plain.sourceUrl }, proposedRecord: plain };
    expect(validateSourceReviews([smuggled], { policies: [plain], timelineEvents: [] }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('legislativeUpdate is only for an update review of a legislative record')]),
    );
  });
});
