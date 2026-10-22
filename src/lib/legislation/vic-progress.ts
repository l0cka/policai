import * as cheerio from 'cheerio';
import type { SourceEvidence } from '@/types';
import type { BillEvent, Chamber } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * Reads the stage history of a Victorian Legislation bill page
 * (`legislation.vic.gov.au/bills/<slug>`), which answers plain HTTP. Each
 * House has a section headed "First House: Legislative Council" or "Second
 * House: Legislative Assembly", and a "Royal Assent" section follows once
 * assented. Each stage is a `dt` naming it and a `dd` whose first span holds
 * the date ("4 Aug 2022", "28 July 2026" or "19/08/2022").
 */

const CHAMBERS: [RegExp, Chamber][] = [
  [/legislative assembly/i, 'lower'],
  [/legislative council/i, 'upper'],
];

/** Stages that do not move a bill through its lifecycle. */
const PROCEDURAL = [
  /^introduced by\b/,
  /^statements? of compatibility tabled$/,
  /^second reading (?:moved|passed)$/,
  /^debate resumed$/,
  /^government business program$/,
  /amendments circulated$/,
  /^date committed$/,
  /^committee of the whole completed\b/,
  /^third reading moved$/,
  /^message received from (?:council|assembly)$/,
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The leading date of a stage's date cell, which may carry trailing link text. */
function stageDate(text: string): string | null {
  const named = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})/i.exec(text);
  const month = named ? MONTHS.indexOf(named[2].toLowerCase()) + 1 : 0;
  if (named && month > 0) return `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  return numeric ? `${numeric[3]}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}` : null;
}

export function parseVicBillProgress(html: string, source: SourceEvidence): RegisterReading<BillEvent> {
  const $ = cheerio.load(html);
  const dated: { date: string; event: BillEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];
  $('div.tide-bill-section').each((_, section) => {
    const heading = squash($(section).find('h2.tide-bill-section__title').text());
    const chamber = CHAMBERS.find(([pattern]) => pattern.test(heading))?.[1] ?? null;
    const stages = $(section)
      .find('li.tide-bill-section__fields-item')
      .map((_, item) => ({
        stage: squash($(item).find('dt').first().text()),
        date: stageDate(squash($(item).find('dd.tide-bill-section__fields-term-date span').first().text())),
      }))
      .get();
    if (!chamber) {
      const assent = stages.find(({ stage }) => /^royal assent given$/i.test(stage));
      const act = stages.map(({ stage }) => /^act number (\d+)\/(\d{4})$/i.exec(stage)).find(Boolean);
      if (assent?.date && act) dated.push({ date: assent.date, event: { kind: 'assented', actCitation: `Act No. ${act[1]} of ${act[2]}` } });
      else if (assent?.date) unrecognised.push({ chamber: null, stage: assent.stage, date: assent.date });
      for (const { stage, date } of stages) {
        if (date && stage !== assent?.stage) unrecognised.push({ chamber: null, stage, date });
      }
      return;
    }
    const amended = stages.some(({ stage }) => /^committee of the whole completed - bill amended$/i.test(stage));
    for (const { stage, date } of stages) {
      if (!date) continue;
      const name = stage.toLowerCase();
      if (name === 'first reading passed') {
        // The second House's first reading is the bill arriving there.
        if (/^first house\b/i.test(heading)) dated.push({ date, event: { kind: 'introduced', chamber } });
      } else if (name === 'third reading passed') {
        dated.push({ date, event: { kind: 'passed', chamber, ...(amended ? { withAmendments: true } : {}) } });
      } else if (/\bdefeated$/.test(name)) {
        dated.push({ date, event: { kind: 'negatived', chamber } });
      } else if (name === 'bill withdrawn' || name === 'bill lapsed') {
        dated.push({ date, event: { kind: name === 'bill withdrawn' ? 'withdrawn' : 'lapsed' } });
      } else if (!PROCEDURAL.some((pattern) => pattern.test(name))) {
        unrecognised.push({ chamber, stage, date });
      }
    }
  });
  const title = squash($('h1').first().text()) || null;
  return {
    title,
    events: dated
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }) => ({ date, precision: 'day' as const, event, source })),
    unrecognised,
  };
}
