import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { legislativePhase, type Dated, type Legislative, type LegislativeEvent } from './model';
import { parseVicBillProgress } from './vic-progress';

const page = (slug: string) => `https://www.legislation.vic.gov.au/bills/${slug}`;
const fixture = (slug: string) => readFileSync(join(__dirname, '__fixtures__/state', `vic-bill-${slug}.html`), 'utf8');
const read = (slug: string) => parseVicBillProgress(fixture(slug), { url: page(slug) });

const PLEBISCITE = 'cannabis-legalisation-plebiscite-bill-2026';
const SEXUAL_OFFENCES = 'justice-legislation-amendment-sexual-offences-and-other-matters-bill-2022';
const FOLLOW_THE_MONEY = 'independent-broad-based-anti-corruption-commission-amendment-follow-money-bill-2026';

function bill(events: Dated<LegislativeEvent>[]): Legislative {
  return {
    kind: 'bill',
    ref: { register: 'state', jurisdiction: 'vic', url: page(SEXUAL_OFFENCES) },
    origin: 'government',
    events: events as Extract<Legislative, { kind: 'bill' }>['events'],
  };
}

describe('parseVicBillProgress', () => {
  it('reads the first reading as the introduction, citing the bill page', () => {
    const reading = read(PLEBISCITE);
    expect(reading.title).toBe('Cannabis Legalisation Plebiscite Bill 2026');
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([['2026-07-28', { kind: 'introduced', chamber: 'upper' }]]);
    expect(reading.events[0].source).toEqual({ url: page(PLEBISCITE) });
    expect(reading.unrecognised).toEqual([]);
  });

  it('reads passage through both Houses and assent with the Act number', () => {
    const reading = read(SEXUAL_OFFENCES);
    expect(reading.events.map(({ date, event }) => [date, event])).toEqual([
      ['2022-08-04', { kind: 'introduced', chamber: 'lower' }],
      ['2022-08-18', { kind: 'passed', chamber: 'lower' }],
      ['2022-08-30', { kind: 'passed', chamber: 'upper' }],
      ['2022-09-06', { kind: 'assented', actCitation: 'Act No. 38 of 2022' }],
    ]);
    expect(reading.unrecognised).toEqual([]);
    expect(legislativePhase(bill(reading.events), 'vic')).toBe('made');
  });

  it('reads Council passage with amendment and the Assembly defeating the bill at its first reading', () => {
    expect(read(FOLLOW_THE_MONEY).events.map(({ date, event }) => [date, event])).toEqual([
      ['2026-03-03', { kind: 'introduced', chamber: 'upper' }],
      ['2026-03-18', { kind: 'passed', chamber: 'upper', withAmendments: true }],
      ['2026-03-18', { kind: 'negatived', chamber: 'lower' }],
    ]);
  });

  it('shows a stage it does not know, and assent without an Act number, to a reviewer', () => {
    const html = fixture(SEXUAL_OFFENCES)
      .replace('>Act number 38/2022<', '>Act number pending<')
      .replace('>Debate resumed<', '>Bill withdrawn<');
    expect(parseVicBillProgress(html, { url: page(SEXUAL_OFFENCES) }).unrecognised).toEqual([
      { chamber: 'lower', stage: 'Bill withdrawn', date: '2022-08-18' },
      { chamber: null, stage: 'Royal Assent given', date: '2022-09-06' },
    ]);
  });
});
