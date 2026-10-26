import { describe, expect, it } from 'vitest';
import { checkDeadlines } from '../src/lib/deadline-check.js';
import type { StoredDeadline } from '../src/lib/deadline-rules.js';
import { applyVerification } from '../src/lib/deadline-verify.js';

const TODAY = '2026-10-26';
const NOW = new Date('2026-10-26T02:00:00Z');

function check(deadlines: StoredDeadline[], text: string) {
  const checks = checkDeadlines({ id: 1, title: 't', url: 'https://t.test', deadlines }, text, TODAY);
  const verdicts = checks.flatMap((c) => (c.verdict ? [c.verdict] : []));
  return { checks, verdicts, saved: applyVerification(deadlines, { verdicts }, NOW) };
}

const action = (date: string, label = 'Submissions close'): StoredDeadline => ({ date, label, kind: 'action' });

// Excerpts from the source pages as fetched on 2026-10-26.
describe('checkDeadlines on real pages', () => {
  it('161: a passed submission date is closed and stays the main date', () => {
    const { verdicts } = check([action('2026-10-16')],
      '“We are now asking if reform is needed to make it easier for young people’s voices to be heard and considered when FVIO decisions are made.”\nThe Commission is calling for submissions by 16 October 2026.\nThe issues paper is available at: Family Violence Intervention Orders');
    expect(verdicts[0]).toMatchObject({ status: 'closed', kind: 'action', precision: 'day', primary: true, quote: 'The Commission is calling for submissions by 16 October 2026.' });
  });

  it('35580: "due by 5pm AEST" is an action', () => {
    const { verdicts } = check([action('2026-09-25')],
      '* Presenting a clear set of options.\nKey details:\n* Responses are due by 5pm AEST, 25 September 2026\n* Contract period: October to December 2026');
    expect(verdicts[0]).toMatchObject({ status: 'closed', kind: 'action', primary: true, quote: '* Responses are due by 5pm AEST, 25 September 2026' });
  });

  it('74628: a date written without its year still matches', () => {
    const { verdicts } = check([action('2026-11-02')],
      'It needs to hear clearly: rehabilitate Hazelwood properly.\nUntil 2 November, you have an opportunity to review the EES and share your views through this submission process\n.');
    expect(verdicts[0]).toMatchObject({ status: 'open', kind: 'action', primary: true });
  });

  it('78164: "open until" is governed by "until"', () => {
    const { verdicts } = check([action('2026-11-13')],
      'on whether the law should be reformed.\nSubmissions are now open until 13 November 2026.\nPlease email us to make a submission.');
    expect(verdicts[0]).toMatchObject({ status: 'open', kind: 'action', primary: true, quote: 'Submissions are now open until 13 November 2026.' });
  });

  it('79179: month-first dates match', () => {
    const { verdicts } = check([action('2027-06-30')],
      'The 2027 National Redress Deadline\n==========\nThe National Redress Scheme closes for applications June 30, 2027. If you are considering lodging an application, read on.');
    expect(verdicts[0]).toMatchObject({ status: 'open', kind: 'action', primary: true });
  });

  it('81181: a commencement date is a milestone, and "extend" alone is not an extension', () => {
    const { verdicts, saved } = check([action('2026-12-10', 'ADM obligations')],
      "New privacy obligations requiring disclosure of certain automated decision-making (ADM) processes commence on 10 December 2026. The OAIC's final guidance confirms the requirements extend well beyond truly 'automated' decisions.");
    expect(verdicts[0]).toMatchObject({ status: 'open', kind: 'milestone', primary: false, corrected_date: null });
    expect(saved.outcomes[0].action).toBe('corrected');
    expect(saved.deadlines[0]).toMatchObject({ kind: 'milestone', primary: false });
  });

  it('the bare verb "defer" is not a deferral', () => {
    const { verdicts } = check([action('2026-11-06', 'Submissions close')],
      'Courts defer to the statute. Submissions close 6 November 2026.');
    expect(verdicts[0]).toMatchObject({ status: 'open', kind: 'action', primary: true });
  });

  it('81181: two "commence" mentions outvote one "deadline" mention', () => {
    const { verdicts } = check([action('2026-12-10', 'ADM obligations')], [
      'New privacy obligations requiring disclosure of certain automated decision-making (ADM) processes commence on 10 December 2026.',
      'To be ready by 10 December, review your systems.',
      '* Review and update your privacy policy: Prepare and issue updates to your privacy policy by the 10 December deadline.',
      'Get advice before the obligations commence on 10 December.',
    ].join('\n'));
    expect(verdicts[0]).toMatchObject({ kind: 'milestone', primary: false, quote: expect.stringContaining('commence on 10 December 2026') });
  });

  it('86679: a "Date:" heading marks an event', () => {
    const { verdicts } = check([action('2026-10-23', 'Register for Changing Mind & Positive Ageing Expo')],
      'Title: Changing Mind & Positive Ageing Expo 2026\nDate: Friday 23 October 2026\nVenue: City of Geelong Bowls Club\nRegister: https://www.trybooking.com/DLYGM');
    expect(verdicts[0]).toMatchObject({ kind: 'milestone', primary: false, status: 'closed' });
  });

  it('93842: an election day is a milestone', () => {
    const { verdicts } = check([action('2026-11-28', 'Victorian election')],
      'the VEC will publish an official list after 9 November.\n The election is on Saturday, 28 November 2026 , although many people will cast an early vote.');
    expect(verdicts[0]).toMatchObject({ kind: 'milestone', primary: false, status: 'open' });
  });

  it('99794: a bare "Closes" line is quoted whole', () => {
    const { verdicts } = check([action('2026-11-06')],
      'Have your say\n-------------\nMake a submission\nCloses 6 Nov 2026\nOpened 15 Oct 2026\nContact');
    expect(verdicts[0]).toMatchObject({ status: 'open', kind: 'action', primary: true, quote: 'Closes 6 Nov 2026' });
  });

  it('61587: a date gone from the page is not_found and loses primary', () => {
    const { verdicts, saved } = check([action('2026-10-16')],
      'How to have your say\n--------------------\nThe consultation is now closed.\nWhat we will do next');
    expect(verdicts[0]).toMatchObject({ status: 'not_found', quote: '', primary: false });
    expect(saved.outcomes[0].action).toBe('status_only');
    expect(saved.deadlines[0]).toMatchObject({ date: '2026-10-16', status: 'not_found', primary: false });
  });
});

describe('checkDeadlines on cases the real batch lacked', () => {
  it('leaves a date the page may have extended or postponed unchanged', () => {
    for (const text of [
      'Submissions close 6 November 2026. Update: the closing date has been extended to 20 November 2026.',
      'Submissions close 6 November 2026 and have been extended to 20 November 2026.',
      'Submissions close 6 November 2026. The closing date was extended to November 20, 2026.',
      'Submissions close 6 November 2026. The forum was postponed to 30 November 2026.',
      'Submissions close 6 November 2026 and will not be extended to 20 November 2026.',
    ]) {
      expect(check([action('2026-11-06')], text).checks[0], text)
        .toEqual({ verdict: null, uncertain: '2026-11-06 left unchanged: the page mentions an extension or postponement' });
    }
    for (const text of [
      'Submissions close 6 December 2026. Extended to 15 January.',
      'Submissions close 6 December 2026. The closing date has been extended to 6 December 2027.',
      'Submissions close 6 December 2026 and the closing date has been extended to 2026-12-20.',
      'Submissions close 6 December 2026.\nUpdate\nThe closing date of 6 December 2026 has been extended to 4 January 2027.',
      `Submissions close 6 December 2026. ${'After requests from many services and organisations, '.repeat(6)}the closing date has been extended to 4 January 2027.`,
      'A deadline extension to 20 December 2026 was granted. Submissions close 6 December 2026.',
      'Submissions close 6 December 2026. A deferral to 20 December 2026 applies.',
      'Submissions close 6 December 2026. We are postponing the closing date to 4 January 2027.',
      'Submissions close 6 December 2026. We are rescheduling the closing date.',
      'Submissions close 6 December 2026. We are extending the closing date.',
      'Submissions close 6 December 2026. A deferment to 20 December 2026 applies.',
      'Submissions close 6 December 2026. The hearing has been re-scheduled to 4 January 2027.',
      'Submissions close 6 December 2026. The hearing has been re–scheduled to 4 January 2027.',
      'Submissions close 6 December 2026. The closing date extends until Friday 18 December 2026.',
      'The Minister extends the consultation. Submissions close 6 December 2026.',
      'This notice extends the closing date to 20 December 2026. Submissions close 6 December 2026.',
      'The closing date extends until Friday the 18th of December 2026. Submissions close 6 December 2026.',
      'The period extends to 20.12.2026. Submissions close 6 December 2026.',
      'The Minister extends the period. Submissions close 6 December 2026.',
      'Submissions close 6 December 2026. The closing date extends to 20 December 2026.',
      `${'Body copy about the consultation. '.repeat(3000)}\nThe consultation period was extended.\n${'More body copy. '.repeat(3000)}\nSubmissions close 6 December 2026.`,
    ]) {
      expect(check([action('2026-12-06')], text).checks[0].verdict, text).toBeNull();
    }
  });

  it('keeps a "Date:" heading with a clock range a milestone', () => {
    const { verdicts } = check([action('2026-11-06', 'Register for Changing Mind & Positive Ageing Expo')], 'Date: Friday 6 November 2026, 9am until 5pm');
    expect(verdicts[0]).toMatchObject({ kind: 'milestone', primary: false });
  });

  it('treats "due to" as prose', () => {
    const { verdicts } = check([action('2026-11-06', 'Register for Changing Mind & Positive Ageing Expo')], 'Date: Friday 6 November 2026 due to high demand');
    expect(verdicts[0]).toMatchObject({ kind: 'milestone', primary: false });
  });

  it('a period inside a number does not end the sentence', () => {
    expect(check([action('2026-11-06')], 'Under version 1.2.10 of the rules, submissions close 6 November 2026.').verdicts[0])
      .toMatchObject({ quote: 'Under version 1.2.10 of the rules, submissions close 6 November 2026.' });
  });

  it('keeps a "5 p.m." sentence whole', () => {
    expect(check([action('2026-11-06')], 'Submissions close at 5 p.m. on 6 November 2026.').verdicts[0])
      .toMatchObject({ kind: 'action', primary: true, quote: 'Submissions close at 5 p.m. on 6 November 2026.' });
  });

  it('keeps month and year dates open until their period ends', () => {
    expect(check([{ date: '2026-10-01', label: 'Applications close', kind: 'action', precision: 'month' }], 'Applications close in October 2026.').verdicts[0])
      .toMatchObject({ status: 'open' });
    expect(check([{ date: '2026-01-01', label: 'Reforms due', kind: 'milestone', precision: 'year' }], 'The reforms are due by 2026.').verdicts[0])
      .toMatchObject({ status: 'open' });
  });

  it('does not let a distant deadline word make an information session an action', () => {
    const stored: StoredDeadline[] = [{ date: '2026-11-16', label: 'Information session', kind: 'milestone' }];
    const { saved } = check(stored, 'The deadline for the previous round has passed and the information session is 16 November 2026.');
    expect(saved.deadlines[0]).toMatchObject({ kind: 'milestone', primary: false });
  });

  it('checks month-precision dates against "Month YYYY"', () => {
    const { verdicts } = check([{ date: '2026-12-01', label: 'Applications close', kind: 'action', precision: 'month' }],
      'Applications close in December 2026.');
    expect(verdicts[0]).toMatchObject({ status: 'open', precision: 'month', kind: 'action' });
  });

  it('checks year-precision dates against "by YYYY"', () => {
    const { verdicts } = check([{ date: '2027-01-01', label: 'Reforms commence', kind: 'milestone', precision: 'year' }],
      'The reforms are expected to commence by 2027.');
    expect(verdicts[0]).toMatchObject({ status: 'open', precision: 'year', kind: 'milestone' });
  });

  it('does not match a day and month that belong to another year', () => {
    const { verdicts } = check([action('2026-11-06')], 'Submissions closed 6 November 2025.');
    expect(verdicts[0]).toMatchObject({ status: 'not_found' });
  });

  it('picks the closing date as primary over an earlier request date', () => {
    const { saved } = check(
      [action('2026-11-02', 'Alternative formats'), action('2026-11-16')],
      'Call us by 2 November 2026 to request other formats. Submissions close 16 November 2026.',
    );
    expect(saved.deadlines.map((d) => [d.date, d.primary])).toEqual([['2026-11-02', false], ['2026-11-16', true]]);
  });

  it('keeps the stored primary when two closing dates tie', () => {
    const stored: StoredDeadline[] = [
      { date: '2026-11-02', label: 'Round one closes', kind: 'action', primary: false },
      { date: '2026-11-16', label: 'Round two closes', kind: 'action', primary: true },
    ];
    const { checks, saved } = check(stored, 'Round one closes 2 November 2026. Round two closes 16 November 2026.');
    expect(checks.every((c) => c.uncertain === null)).toBe(true);
    expect(saved.deadlines.map((d) => d.primary)).toEqual([false, true]);
  });

  it('counts a date range as one mention', () => {
    const { verdicts } = check([action('2026-12-12', 'Registrations close')],
      'The expo runs 10–12 December 2026. Register by 12 December 2026. Applications close 12 December 2026.');
    expect(verdicts[0]).toMatchObject({ kind: 'action', primary: true });
  });

  it('lets a close word beat a "Date:" heading', () => {
    const { verdicts } = check([action('2026-11-06')], 'Date: 6 November 2026 (submissions close).');
    expect(verdicts[0]).toMatchObject({ kind: 'action', primary: true });
  });

  it('leaves a date unchanged when its mentions split evenly', () => {
    const { checks } = check([action('2026-11-16')], 'Submissions close 16 November 2026.\nThe forum opens 16 November 2026.');
    expect(checks[0]).toEqual({ verdict: null, uncertain: '2026-11-16 left unchanged: mentions disagree on deadline or event' });
  });

  it('leaves a date unchanged when nothing beside it says what it is', () => {
    const stored = [action('2026-11-16')];
    const { checks, saved } = check(stored, 'Published 16 November 2026.');
    expect(checks[0]).toEqual({ verdict: null, uncertain: '2026-11-16 left unchanged: no deadline or event wording beside the date' });
    expect(saved.outcomes[0].action).toBe('unverified');
    expect(saved.deadlines[0]).toEqual(stored[0]);
  });
});
