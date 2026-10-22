import * as cheerio from 'cheerio';
import type { SourceEvidence } from '@/types';
import type { BillEvent, Chamber } from './model';
import type { RegisterReading, UnrecognisedStage } from './stage-update';

/**
 * Reads the Progress table and committee Notes of an APH bill home page
 * (`Result?bId=`). The page is served only to a browser; the collector
 * retrieves it through Chromium with the Policai identity.
 *
 * Each Progress table is one chamber segment, headed by the chamber's name;
 * the last segment has an empty heading and holds "Finally passed both
 * Houses" and "Assent". A chamber can appear twice when it considers the
 * other's amendments. Committee referrals are not in the table but in the
 * Notes list further down the page.
 */

const APH_ORIGIN = 'https://www.aph.gov.au';

const CHAMBERS: Record<string, Chamber> = {
  'house of representatives': 'lower',
  senate: 'upper',
};

/** Procedural stages that do not move a bill through its lifecycle. */
const PROCEDURAL = new Set([
  'second reading moved',
  'second reading debate',
  'second reading agreed to',
  'referred to federation chamber',
  'reported from federation chamber',
  'consideration in detail debate',
  'consideration of senate message',
  'consideration of house of representatives message',
  'finally passed both houses',
]);

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** "15 Oct 2026" → "2026-10-15". */
function tableDate(text: string): string | null {
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(squash(text));
  const month = match && MONTHS[match[2].toLowerCase()];
  return match && month ? `${match[3]}-${month}-${match[1].padStart(2, '0')}` : null;
}

/** "15/10/2026" → "2026-10-15". */
function noteDate(text: string): string | null {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

export function parseAphProgress(html: string, source: SourceEvidence): RegisterReading<BillEvent> {
  const $ = cheerio.load(html);
  const dated: { date: string; event: BillEvent }[] = [];
  const unrecognised: UnrecognisedStage[] = [];
  let introduced = false;

  $('#main_0_mainDiv table').each((_, table) => {
    const heading = squash($(table).find('thead th').first().text()).toLowerCase();
    const chamber: Chamber | null = CHAMBERS[heading] ?? null;
    let amended = false;
    $(table)
      .find('tbody tr')
      .each((_, row) => {
        const cells = $(row).children('td');
        const stage = squash(cells.first().children('span').first().text());
        const name = stage.toLowerCase();
        const details = cells
          .first()
          .find('li')
          .map((_, item) => squash($(item).text()))
          .get();
        const date = tableDate(cells.eq(1).text());
        if (!date) return;
        if (details.some((detail) => /amendment details/i.test(detail))) amended = true;

        if (name === 'introduced and read a first time' && chamber) {
          if (!introduced) dated.push({ date, event: { kind: 'introduced', chamber } });
          introduced = true;
        } else if (name === 'third reading agreed to' && chamber) {
          dated.push({ date, event: { kind: 'passed', chamber, ...(amended ? { withAmendments: true } : {}) } });
        } else if (name === 'assent') {
          const value = (label: string) =>
            cells
              .first()
              .find('li')
              .filter((_, item) => squash($(item).children('span').first().text()).toLowerCase() === label)
              .children('span')
              .last()
              .text()
              .trim();
          const number = value('act no');
          const year = value('year');
          if (number && year) dated.push({ date, event: { kind: 'assented', actCitation: `Act No. ${number} of ${year}` } });
          else unrecognised.push({ chamber, stage, date });
        } else if (/negatived/.test(name) && chamber) {
          dated.push({ date, event: { kind: 'negatived', chamber } });
        } else if (/^lapsed/.test(name)) {
          dated.push({ date, event: { kind: 'lapsed' } });
        } else if (/^withdrawn/.test(name)) {
          dated.push({ date, event: { kind: 'withdrawn' } });
        } else if (!PROCEDURAL.has(name)) {
          unrecognised.push({ chamber, stage, date });
        }
      });
  });

  $('h3')
    .filter((_, heading) => squash($(heading).text()) === 'Notes')
    .first()
    .nextAll('ul')
    .first()
    .children('li')
    .each((_, item) => {
      const text = squash($(item).text());
      const referral = /^Referred to Committee \((\d{1,2}\/\d{1,2}\/\d{4})\): ([^;]+);/.exec(text);
      if (!referral) return;
      const referredOn = noteDate(referral[1]);
      const committee = referral[2].trim();
      const link = $(item).find('a').first();
      const href = link.attr('href');
      if (!referredOn || !href) return;
      const url = new URL(href, APH_ORIGIN).toString();
      const linkText = squash(link.text());
      const due = /^Report due/i.test(linkText) ? noteDate(linkText) : null;
      dated.push({
        date: referredOn,
        event: { kind: 'referred', committee, inquiryUrl: url, ...(due ? { reportDue: due } : {}) },
      });
      const reportedOn = /^Committee report/i.test(linkText) ? noteDate(linkText) : null;
      if (reportedOn) dated.push({ date: reportedOn, event: { kind: 'reported', committee, reportUrl: url } });
    });

  // The first h1 is the site logo, with no text.
  const title =
    $('h1')
      .map((_, heading) => squash($(heading).text()))
      .get()
      .find(Boolean) ?? null;
  return {
    title,
    // Stable sort keeps the page's own order for events on the same day.
    events: dated
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index)
      .map(({ date, event }) => ({ date, precision: 'day' as const, event, source })),
    unrecognised,
  };
}
