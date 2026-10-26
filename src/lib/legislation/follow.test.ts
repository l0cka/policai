import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildPolicy } from '@/test/factories';
import type { Policy, SourceReview } from '@/types';
import { canonicalizeSourceUrl } from '@/lib/source-url';
import { validateSourceReviews } from '@/lib/validate-data';
import { aphBillPage, BROWSER_REGISTERS, followLegislation, followTargets } from './follow';
import { frlAmendedPrincipals, frlTitleRecord, frlVersionsFrom, parseFrlTitle } from './frl-title';
import type { Dated, Legislative, LegislativeEvent } from './model';
import { saBillPage } from './sa-salt';

const fixture = (billId: string) => readFileSync(join(__dirname, '__fixtures__/aph', `${billId}.html`), 'utf8');

function bill(billId: string, events: Dated<LegislativeEvent>[]): Policy {
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

const frlFixture = readFileSync(join(__dirname, '__fixtures__/frl/F2026L01223.json'), 'utf8');

function rules(events: Dated<LegislativeEvent>[], dates: Policy['dates'] = []): Policy {
  return buildPolicy({
    dates,
    id: 'asic-rules',
    title: 'ASIC AI trading rules',
    type: 'regulation',
    status: 'active',
    sourceUrl: 'https://www.asic.gov.au/media-release',
    legislative: {
      kind: 'instrument',
      ref: { register: 'frl', titleId: 'F2026L01223' },
      issuerBodyId: 'asic',
      enablingAct: 'Corporations Act 2001, s 798G(1)',
      events: events as Extract<Legislative, { kind: 'instrument' }>['events'],
    },
  });
}

const frl = (name: string) => readFileSync(join(__dirname, '__fixtures__/frl', `${name}.json`), 'utf8');

/** The register API: this title record, its principal search, and the principal's versions. */
const register = (title: string) => async (url: string) => ({
  body: url.includes('/Search(') ? frl('search-affects-F2026L01223-amending') : url.includes('/Versions?') ? frl('F2017L01474.versions') : title,
  evidence: { url },
});

const now = new Date('2026-10-22T05:00:00Z');
const retrieveFixture = (billId: string) => async (url: string) => ({
  body: fixture(billId),
  evidence: { url, retrievedAt: now.toISOString(), contentHash: 'a'.repeat(64) },
});

describe('followTargets', () => {
  it('follows APH bills whose source is their bill page and Federal Register instruments, not trashed or other records', () => {
    const targets = followTargets([
      bill('r7553', [introduced('2026-10-15', 'lower', 'r7553')]),
      { ...bill('s1471', []), status: 'trashed' },
      { ...bill('r7537', []), sourceUrl: 'https://www.aph.gov.au/elsewhere' },
      rules([]),
      buildPolicy({ id: 'guideline' }),
    ]);
    expect(targets.map((target) => [target.sourceId, target.register, target.url])).toEqual([
      ['track:bill-r7553', 'aph', aphBillPage('r7553')],
      ['track:asic-rules', 'frl', frlTitleRecord('F2026L01223')],
    ]);
  });
});

const TAS_BILL = 'https://www.parliament.tas.gov.au/bills/bills2026/commission-of-inquiry-miscellaneous-amendments-bill-2026-25-of-2026';

function tasBill(url: string): Policy {
  return buildPolicy({
    id: 'tas-commission-bill',
    title: 'Commission of Inquiry (Miscellaneous Amendments) Bill 2026',
    jurisdiction: 'tas',
    type: 'legislation',
    status: 'proposed',
    sourceUrl: url,
    legislative: { kind: 'bill', ref: { register: 'state', jurisdiction: 'tas', url }, origin: 'government', events: [] },
  });
}

describe('followTargets for state bills', () => {
  it('follows a Tasmanian bill at its Parliament page, and no other state page', () => {
    const targets = followTargets([tasBill(TAS_BILL), { ...tasBill('https://www.legislation.tas.gov.au/view/html/asmade/act-2026-001'), id: 'tas-act' }]);
    expect(targets.map((target) => [target.sourceId, target.register, target.url])).toEqual([['track:tas-commission-bill', 'tas', TAS_BILL]]);
  });

  it('stages the first reading the page shows', async () => {
    const page = readFileSync(join(__dirname, '__fixtures__/state/tas-bill-commission-of-inquiry-2026.html'), 'utf8');
    const { reviews, errors } = await followLegislation({
      targets: followTargets([tasBill(TAS_BILL)]),
      existingReviews: [],
      retrieve: async (url) => ({ body: page, evidence: { url, retrievedAt: now.toISOString(), contentHash: 'b'.repeat(64) } }),
      now,
    });
    expect(errors).toEqual([]);
    expect(reviews[0].legislativeUpdate?.added.map(({ date, event }) => [date, event])).toEqual([['2026-08-11', { kind: 'introduced', chamber: 'lower' }]]);
    expect(reviews[0].notes).toContain('House of Assembly');
  });
});

function saBill(url: string): Policy {
  return buildPolicy({
    id: 'sa-petroleum-bill',
    title: 'Petroleum Products Regulation (Emergencies and Other Matters) Amendment Bill 2026',
    jurisdiction: 'sa',
    type: 'legislation',
    status: 'proposed',
    sourceUrl: url,
    legislative: { kind: 'bill', ref: { register: 'state', jurisdiction: 'sa', url }, origin: 'government', events: [] },
  });
}

describe('followTargets for SA bills', () => {
  it('follows an SA bill page through the SALT API, and no other SA page', () => {
    const targets = followTargets([saBill(saBillPage(5619)), { ...saBill('https://www.legislation.sa.gov.au/lz?path=/c/a/petroleum'), id: 'sa-act' }]);
    expect(targets.map((target) => [target.sourceId, target.register, target.url])).toEqual([
      ['track:sa-petroleum-bill', 'sa', 'https://prod-internet-salt-functionapp.azurewebsites.net/api/GetBillSummaries?billId=5619'],
    ]);
  });

  it('stages passage from the bill summary, and asks the reviewer to confirm assent', async () => {
    const summary = readFileSync(join(__dirname, '__fixtures__/state/sa-salt-bill-5619-assented.json'), 'utf8');
    const { reviews, errors } = await followLegislation({
      targets: followTargets([saBill(saBillPage(5619))]),
      existingReviews: [],
      retrieve: async (url) => ({ body: summary, evidence: { url, retrievedAt: now.toISOString(), contentHash: 'c'.repeat(64) } }),
      now,
    });
    expect(errors).toEqual([]);
    expect(reviews[0].legislativeUpdate?.added.map(({ event }) => event.kind)).toEqual(['introduced', 'passed', 'passed']);
    expect(reviews[0].notes).toContain('Assented as Act No. 1 of 2026, date not confirmed');
    expect(reviews[0].proposedRecord).toMatchObject({ sourceUrl: saBillPage(5619) });
  });
});

const VIC_BILL = 'https://www.legislation.vic.gov.au/bills/cannabis-legalisation-plebiscite-bill-2026';

describe('followTargets for Victorian bills', () => {
  const vicBill = (url: string): Policy =>
    buildPolicy({
      id: 'vic-plebiscite-bill',
      title: 'Cannabis Legalisation Plebiscite Bill 2026',
      jurisdiction: 'vic',
      type: 'legislation',
      status: 'proposed',
      sourceUrl: url,
      legislative: { kind: 'bill', ref: { register: 'state', jurisdiction: 'vic', url }, origin: 'private_member', events: [] },
    });

  it('follows a Victorian bill at its bill page, and no other Victorian page', () => {
    const targets = followTargets([vicBill(VIC_BILL), { ...vicBill('https://www.legislation.vic.gov.au/as-made/acts/example-act-2026'), id: 'vic-act' }]);
    expect(targets.map((target) => [target.sourceId, target.register, target.url])).toEqual([['track:vic-plebiscite-bill', 'vic', VIC_BILL]]);
  });

  it('stages the first reading the page shows', async () => {
    const page = readFileSync(join(__dirname, '__fixtures__/state/vic-bill-cannabis-legalisation-plebiscite-bill-2026.html'), 'utf8');
    const { reviews, errors } = await followLegislation({
      targets: followTargets([vicBill(VIC_BILL)]),
      existingReviews: [],
      retrieve: async (url) => ({ body: page, evidence: { url, retrievedAt: now.toISOString(), contentHash: 'd'.repeat(64) } }),
      now,
    });
    expect(errors).toEqual([]);
    expect(reviews[0].legislativeUpdate?.added.map(({ date, event }) => [date, event])).toEqual([['2026-07-28', { kind: 'introduced', chamber: 'upper' }]]);
  });
});

describe('followTargets for NSW and WA bills', () => {
  const stateBill = (id: string, jurisdiction: 'nsw' | 'wa', url: string): Policy =>
    buildPolicy({
      id,
      title: id,
      jurisdiction,
      type: 'legislation',
      status: 'proposed',
      sourceUrl: url,
      legislative: { kind: 'bill', ref: { register: 'state', jurisdiction, url }, origin: 'government', events: [] },
    });

  it('follows NSW and WA bill pages through the browser registers, and no other page', () => {
    const nsw = 'https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=18875';
    const wa = 'https://www.parliament.wa.gov.au/parliament/bills.nsf/BillProgressPopup?OpenForm=&ParentUNID=5107DFD50A7DA2E448258DEE0026841D';
    const targets = followTargets([
      stateBill('nsw-bill', 'nsw', nsw),
      stateBill('wa-bill', 'wa', wa),
      stateBill('nsw-act', 'nsw', 'https://legislation.nsw.gov.au/view/html/inforce/current/act-2026-006'),
    ]);
    expect(targets.map((target) => [target.sourceId, target.register, target.url])).toEqual([
      ['track:nsw-bill', 'nsw', nsw],
      ['track:wa-bill', 'wa', wa],
    ]);
    expect(targets.every(({ register }) => BROWSER_REGISTERS.has(register))).toBe(true);
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

  it('does not ask again about an unmapped stage a decided update already showed', async () => {
    const page = (await import('./aph-progress')).parseAphProgress(fixture('r7239'), { url: aphBillPage('r7239') });
    const record = bill('r7239', page.events);
    const [shown] = (await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve: retrieveFixture('r7239'), now })).reviews;
    const decided: SourceReview = {
      ...shown,
      id: 'source-review-follow-bill-r7239-earlier',
      status: 'published',
      legislativeUpdate: { ...shown.legislativeUpdate!, added: [introduced('2024-01-01', 'lower', 'r7239')] },
    };
    const again = await followLegislation({ targets: followTargets([record]), existingReviews: [decided], retrieve: retrieveFixture('r7239'), now });
    expect(again.reviews).toEqual([]);
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
    expect(errors).toEqual(['track:bill-r7553: the bill home page shows no stages; its format may have changed']);
  });
});

describe('followLegislation on a Federal Register instrument', () => {
  const fixed = () => {
    const title = JSON.parse(frlFixture);
    title.parliamentaryScrutinySummary.lastDateForDisallowanceInHoR = '2026-12-03T00:00:00';
    title.parliamentaryScrutinySummary.lastDateForDisallowanceInSenate = '2026-12-04T00:00:00';
    return JSON.stringify(title);
  };

  it('stages nothing while the register shows what the record holds', async () => {
    const record = rules(parseFrlTitle(frlFixture).events, [{ type: 'commenced', date: '2028-03-17', precision: 'day' }]);
    const retrieve = vi.fn(register(frlFixture));
    const result = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve, now });
    expect(result).toMatchObject({ reviews: [], errors: [], results: [{ sourceId: 'track:asic-rules', status: 'success' }] });
    expect(retrieve.mock.calls.map(([url]) => url)).toEqual([
      frlTitleRecord('F2026L01223'),
      frlAmendedPrincipals('F2026L01223'),
      frlVersionsFrom('F2017L01474', '2026-09-17'),
    ]);
  });

  it('stages the disallowance window ends once the register fixes them', async () => {
    const record = rules(parseFrlTitle(frlFixture).events);
    const { reviews } = await followLegislation({
      targets: followTargets([record]),
      existingReviews: [],
      retrieve: register(fixed()),
      now,
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].legislativeUpdate?.added).toEqual([]);
    expect(reviews[0].legislativeUpdate?.changed?.map(({ event }) => event)).toEqual([
      { kind: 'tabled', chamber: 'lower', disallowanceEnds: '2026-12-03' },
      { kind: 'tabled', chamber: 'upper', disallowanceEnds: '2026-12-04' },
    ]);
    expect(reviews[0].notes).toContain('the House disallowance window now ends 3 December 2026; the Senate disallowance window now ends 4 December 2026');
    expect(reviews[0].sourceEvidence?.title).toBe('Federal Register title record');
  });

  it('stages a review the data validator accepts when the record cites its Federal Register details page', async () => {
    const record = { ...rules(parseFrlTitle(frlFixture).events), sourceUrl: 'https://www.legislation.gov.au/F2026L01223/asmade/details' };
    const { reviews } = await followLegislation({
      targets: followTargets([record]),
      existingReviews: [],
      retrieve: async (url) => ({ ...(await register(fixed())(url)), evidence: { url: canonicalizeSourceUrl(url) } }),
      now,
    });
    expect(reviews).toHaveLength(1);
    expect(validateSourceReviews(reviews, { policies: [record], timelineEvents: [] }).errors).toEqual([]);
  });

  it('reports a response that is not a title record as a parse failure', async () => {
    const { errors, results } = await followLegislation({
      targets: followTargets([rules(parseFrlTitle(frlFixture).events)]),
      existingReviews: [],
      retrieve: async (url) => ({ body: '{"error":{"code":"404"}}', evidence: { url } }),
      now,
    });
    expect(results).toMatchObject([{ status: 'error', failureClass: 'parse' }]);
    expect(errors).toEqual(['track:asic-rules: the Federal Register response is not a title record']);
  });
});

describe('followLegislation on an amending instrument', () => {
  const retrieve = register(frlFixture);
  const recorded = () => parseFrlTitle(frlFixture).events;

  it('stages nothing while the record holds the day the register schedules', async () => {
    const record = rules(recorded(), [{ type: 'commenced', date: '2028-03-17', precision: 'day' }]);
    const result = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve, now });
    expect(result).toMatchObject({ reviews: [], errors: [] });
  });

  it('proposes the scheduled commencement when the record has another day', async () => {
    const record = rules(recorded(), [{ type: 'commenced', date: '2028-03-18', precision: 'day' }]);
    const { reviews } = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve, now });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].legislativeUpdate).toMatchObject({ added: [], scheduledCommencement: '2028-03-17' });
    expect((reviews[0].proposedRecord as Policy).dates).toMatchObject([{ type: 'commenced', date: '2028-03-17' }]);
    expect(reviews[0].notes).toContain(
      'The Federal Register schedules sch 1 (items 1-109) to commence in F2017L01474 on 17 March 2028; the record says 18 March 2028.',
    );
  });

  it('adds the commencement as a stage once its day has come', async () => {
    const record = rules(recorded(), [{ type: 'commenced', date: '2028-03-17', precision: 'day' }]);
    const { reviews } = await followLegislation({ targets: followTargets([record]), existingReviews: [], retrieve, now: new Date('2028-03-20T00:00:00Z') });
    expect(reviews[0].legislativeUpdate?.added).toMatchObject([
      { date: '2028-03-17', event: { kind: 'commenced', extent: 'full', note: 'sch 1 (items 1-109) commence in F2017L01474' } },
    ]);
    expect(reviews[0].proposedRecord).toMatchObject({ status: 'active' });
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
