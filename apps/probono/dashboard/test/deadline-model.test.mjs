import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDeadlineView,
  canonicalUrl,
  effectiveKind,
  effectivePrecision,
  formatDeadlineDate,
  jaccard,
  labelTokens,
  primaryIndex,
} from '../lib/deadline-model.ts';

const audit = JSON.parse(readFileSync(new URL('./fixtures/audit-2026-09-23.json', import.meta.url), 'utf8'));
const view = buildDeadlineView(audit.items, audit.today, 30);
const ids = (cards) => cards.map((c) => c.itemId);
const card = (cards, id) => cards.find((c) => c.itemId === id);
const everyId = (cards) => cards.flatMap((c) => [c.itemId, ...c.alsoReportedBy.map((o) => o.itemId)]);

const item = (id, url, deadlines, extra = {}) => ({ id, title: `Item ${id}`, url, published_at: '2026-09-01', deadlines, ...extra });
const d = (date, label, extra = {}) => ({ date, label, kind: 'action', ...extra });

describe('deadline rules for legacy rows', () => {
  it('treats openings, meetings, webinars and launches as milestones', () => {
    for (const label of ['Applications open', 'Special General Meeting to appoint auditor', 'Register for webinar on national standards', 'Portal launch']) {
      assert.equal(effectiveKind({ label, kind: 'action' }), 'milestone', label);
    }
    assert.equal(effectiveKind({ label: 'Consultation opens; submissions close 2 October', kind: 'action' }), 'action');
    assert.equal(effectiveKind({ label: 'Submissions close' }), 'action');
    assert.equal(effectiveKind({ label: 'Report handed down' }), 'milestone');
  });
  it('reads a legacy 1 January as year precision', () => {
    assert.equal(effectivePrecision({ date: '2027-01-01' }), 'year');
    assert.equal(effectivePrecision({ date: '2027-01-02' }), 'day');
    assert.equal(effectivePrecision({ date: '2027-01-01', precision: 'day' }), 'day');
  });
  it('picks the explicit primary, or the latest day action for legacy items', () => {
    assert.equal(primaryIndex([d('2026-10-02', 'Alt formats'), d('2026-10-16', 'Submissions close')]), 1);
    assert.equal(primaryIndex([d('2026-10-02', 'Alt', { primary: false, precision: 'day' }), d('2026-10-16', 'Close', { primary: false, precision: 'day' })]), -1);
    assert.equal(primaryIndex([d('2026-10-02', 'Close', { primary: true, precision: 'day' }), d('2026-10-16', 'Other', { primary: false, precision: 'day' })]), 0);
    assert.equal(primaryIndex([d('2026-10-01', 'Close', { primary: true, precision: 'month' })]), -1);
  });
  it('normalises URLs and label tokens', () => {
    assert.equal(canonicalUrl('https://www.Example.gov.au/consult/?utm_source=x#top'), 'example.gov.au/consult');
    assert.equal(canonicalUrl('javascript:alert(1)'), null);
    assert.ok(jaccard(labelTokens('Submissions on Water Act 2007 review close'), labelTokens('Water Act review submissions close')) >= 0.6);
    assert.equal(labelTokens('Submissions close').size, 0);
  });
  it('formats dates at the precision the source gave', () => {
    assert.equal(formatDeadlineDate('2026-09-01', 'month'), 'Sep 2026');
    assert.equal(formatDeadlineDate('2027-01-01', 'year'), '2027');
    assert.match(formatDeadlineDate('2026-10-16', 'day'), /^16 Oct\.? 2026$/);
    assert.match(formatDeadlineDate('2026-10-16', 'day', false), /^16 Oct\.?$/);
  });
});

describe('merging duplicates', () => {
  it('merges on a shared consultation URL and prefers the official page as the card link', () => {
    const v = buildDeadlineView([
      item(1, 'https://lawfirm.example/insight', [d('2026-10-09', 'Have your say', { primary: true, precision: 'day', quote: 'by 9 October', target_url: 'https://consult.example.gov.au/x' })], { published_at: '2026-09-01' }),
      item(2, 'https://consult.example.gov.au/x/', [d('2026-10-09', 'Submissions close', { primary: true, precision: 'day', quote: 'closes 9 October' })], { published_at: '2026-09-05' }),
    ], '2026-09-23');
    assert.equal(v.closing.length, 1);
    assert.equal(v.closing[0].itemId, 2);
    assert.deepEqual(ids(v.closing[0].alsoReportedBy), [1]);
  });
  it('does not merge different dates or dissimilar labels', () => {
    const v = buildDeadlineView([
      item(1, 'https://a.example/1', [d('2026-10-09', 'Privacy bill submissions close')]),
      item(2, 'https://b.example/2', [d('2026-10-09', 'Torture convention report submissions close')]),
      item(3, 'https://c.example/3', [d('2026-10-10', 'Privacy bill submissions close')]),
    ], '2026-09-23');
    assert.equal(v.closing.length, 3);
  });
});

describe('the 2026-09-23 audit rows, rendered under the new rules', () => {
  it('shows one closing card per deadline, merged across items', () => {
    assert.deepEqual(ids(view.closing), [35580, 26376, 57332, 61587, 161, 4327]);
    assert.deepEqual(ids(card(view.closing, 26376).alsoReportedBy), [66841]);
    assert.deepEqual(ids(card(view.closing, 4327).alsoReportedBy), [4326]);
  });
  it('shows 61587 once, closing 16 Oct, with 2 Oct as a secondary line', () => {
    const c = card(view.closing, 61587);
    assert.equal(c.date, '2026-10-16');
    assert.deepEqual(c.secondary.map((s) => s.date), ['2026-10-02']);
    assert.ok(!everyId(view.calendar).includes(61587));
  });
  it('drops openings, meetings and webinars from closing and closed', () => {
    for (const id of [41366, 25891, 37286]) {
      assert.ok(!everyId([...view.closing, ...view.closed, ...view.calendar]).includes(id), String(id));
    }
  });
  it('merges the Water Act and Safeguard write-ups in recently closed', () => {
    const water = view.closed.filter((c) => c.date === '2026-08-31');
    assert.equal(water.length, 1);
    assert.deepEqual(everyId(water).sort((a, b) => a - b), [12079, 24011, 31356]);
    assert.equal(view.closed.filter((c) => c.label.toLowerCase().includes('safeguard')).length, 1);
  });
  it('moves year-only dates to the calendar as years', () => {
    for (const id of [4307, 12963]) {
      const c = card(view.calendar, id);
      assert.equal(c.precision, 'year', String(id));
      assert.equal(formatDeadlineDate(c.date, c.precision), '2027');
    }
    assert.ok(view.closing.every((c) => c.precision === 'day' && c.kind === 'action'));
  });
});

describe('new-shape rows', () => {
  it('keeps month-precision dates out of closing and renders them in the calendar', () => {
    const v = buildDeadlineView([
      item(1, 'https://a.example/1', [
        d('2026-10-16', 'Submissions close', { primary: true, precision: 'day', quote: 'close 16 October 2026' }),
        d('2026-11-01', 'Final report expected', { kind: 'milestone', primary: false, precision: 'month', quote: 'report in November 2026' }),
      ]),
      item(2, 'https://a.example/2', [d('2026-09-01', 'Grant round closes', { primary: true, precision: 'month', quote: 'closes in September 2026' })]),
    ], '2026-09-23');
    assert.deepEqual(ids(v.closing), [1]);
    assert.deepEqual(v.closing[0].secondary, []);
    assert.deepEqual(v.calendar.map((c) => [c.itemId, formatDeadlineDate(c.date, c.precision)]), [[2, 'Sep 2026'], [1, 'Nov 2026']]);
  });
  it('lists every date of an item with no primary in the calendar, never in closing', () => {
    const v = buildDeadlineView([
      item(1, 'https://a.example/1', [d('2026-10-02', 'Ask for an alternative format', { primary: false, precision: 'day', quote: 'by 2 October' })]),
    ], '2026-09-23');
    assert.deepEqual(v.closing, []);
    assert.deepEqual(ids(v.calendar), [1]);
  });
});

describe('verified rows', () => {
  it('drops closed and not_found dates from closing and the calendar, and carries the check date', () => {
    const v = buildDeadlineView([
      item(1, 'https://a.example/1', [d('2026-10-16', 'Submissions close', { primary: true, precision: 'day', quote: 'close 16 October 2026', status: 'open' })], { verified_at: '2026-09-22T21:30:00Z' }),
      item(2, 'https://a.example/2', [d('2026-10-20', 'Applications close', { primary: false, precision: 'day', quote: 'x', status: 'closed' })], { verified_at: '2026-09-22T01:00:00Z' }),
      item(3, 'https://a.example/3', [d('2026-11-01', 'Suspension ends', { kind: 'milestone', primary: false, precision: 'day', status: 'not_found' })]),
      item(4, 'https://a.example/4', [d('2026-09-18', 'Lodgement closes', { primary: true, precision: 'day', quote: '18 September', status: 'closed' })], { verified_at: '2026-09-23T00:00:00Z' }),
    ], '2026-09-23');
    assert.deepEqual(ids(v.closing), [1]);
    // 21:30 UTC on 22 Sep is 23 Sep in Sydney.
    assert.equal(v.closing[0].checkedOn, '2026-09-23');
    assert.deepEqual(v.calendar, []);
    assert.deepEqual(ids(v.closed), [4]);
    assert.equal(card(view.closing, 26376).checkedOn, null);
  });
});
