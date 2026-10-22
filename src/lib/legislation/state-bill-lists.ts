import * as cheerio from 'cheerio';
import type { Candidate, ExtractionResult } from '@/lib/pipeline/extract';
import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';

/**
 * Readers for state bill lists whose markup the generic HTML extractor
 * cannot read: one row per bill, with the bill's title, a stable link and,
 * where the list gives them, its introduction date and current stage.
 *
 * - `nt`: the NT register's bills before the Legislative Assembly
 *   (plain HTTP). Letter-grouped panels with one paragraph per bill and no
 *   dates; each link is a register GUID written as "~/link.aspx?…".
 * - `qld`: the Queensland Parliament's bills before the House (browser).
 *   Each bill links to its tabled bill text, the only per-bill page it has.
 * - `wa`: the WA Parliament's current bills (browser), a table of House,
 *   bill, date introduced and stage, linking each bill's progress page. The
 *   view pages at 30 rows unless the URL raises Count, so a full page is an
 *   error rather than a silently short list.
 * - `nsw`: the NSW Parliament's current-session bills (browser), one card
 *   per bill with its origin and status. Each card links through a search
 *   redirect that robots disallows, so the bill page is rebuilt from the
 *   billId in the redirect's `url` parameter. The page renders 10 cards and
 *   loads more from a path robots disallows unless `num_ranks` asks for all,
 *   so a page still offering more (`start_rank`) is an error.
 */

export type BillListId = 'nt' | 'qld' | 'wa' | 'nsw';

interface BillRow {
  url: string;
  title: string;
  text: string;
  introduced?: string;
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "13/10/2026" → "2026-10-13". */
function numericDate(text: string): string | undefined {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : undefined;
}

/** "21 Oct 2026" → "2026-10-21". */
function namedDate(text: string): string | undefined {
  const match = /^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})$/i.exec(text);
  const month = match ? MONTHS.indexOf(match[2].toLowerCase()) + 1 : 0;
  return match && month > 0 ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : undefined;
}

const withDate = (introduced: string | undefined) => (introduced ? { introduced } : {});

const READERS: Record<BillListId, ($: cheerio.CheerioAPI, baseUrl: string) => BillRow[] | null> = {
  nt: ($, baseUrl) => {
    const panels = $('div.panel-collapse[id^="bill_acc_"]');
    if (panels.length === 0) return null;
    return panels
      .find('div.panel-body > p > a[href*="link.aspx?_id="]')
      .map((_, link) => {
        const id = /_id=([0-9A-F]{32})/i.exec($(link).attr('href') ?? '')?.[1];
        return id ? { url: new URL(`/~/link.aspx?_id=${id}&_z=z`, baseUrl).href, title: squash($(link).text()), text: 'Before the NT Legislative Assembly.' } : null;
      })
      .get()
      .filter((row): row is BillRow => row !== null);
  },
  qld: ($, baseUrl) => {
    const items = $('div.bills-legislation__item').not('.bills-legislation__item--heading');
    if (items.length === 0) return null;
    return items
      .map((_, item): BillRow | null => {
        const link = $(item).find('div.bills-legislation__col--92 > h5 > a[href]').first();
        const href = link.attr('href');
        if (!href) return null;
        const field = (label: string) =>
          squash(
            $(item)
              .find('div.d-flex')
              .filter((_, pair) => squash($(pair).find('p').first().text()).toLowerCase() === label)
              .find('p')
              .last()
              .text(),
          );
        const introducedBy = field('introduced by:');
        const stage = field('stage reached:');
        return {
          url: new URL(href, baseUrl).href,
          title: squash(link.text()),
          text: [introducedBy && `Introduced by ${introducedBy}`, stage && `stage reached: ${stage}`].filter(Boolean).join('; ') + '.',
          ...withDate(numericDate(introducedBy)),
        };
      })
      .get()
      .filter((row): row is BillRow => row !== null);
  },
  nsw: ($) => {
    const cards = $('a.pims-generic-card');
    if (cards.length === 0) return null;
    if ($.html().includes('start_rank=')) {
      throw new Error('the NSW bill list offers more bills; raise num_ranks in the source URL');
    }
    return cards
      .map((_, card): BillRow | null => {
        const redirect = $(card).attr('href') ?? '';
        let target: string | null = null;
        try {
          target = new URL(redirect).searchParams.get('url');
        } catch {
          return null;
        }
        const billId = target ? /[?&]billId=(\d+)/.exec(target)?.[1] : undefined;
        if (!billId) return null;
        const field = (label: string) =>
          squash(
            $(card)
              .find('dl.pims-generic-card__dl > dt')
              .filter((_, term) => squash($(term).text()).toLowerCase() === label)
              .next('dd')
              .text(),
          );
        const origin = field('origin:');
        const status = field('status:');
        return {
          url: `https://www.parliament.nsw.gov.au/parliamentary-business/bills/bill-details?billId=${billId}`,
          title: squash($(card).find('h2.pims-generic-card__title').text()),
          text: [origin && `Introduced in the ${origin}`, status && `status: ${status}`].filter(Boolean).join('; ') + '.',
        };
      })
      .get()
      .filter((row): row is BillRow => row !== null);
  },
  wa: ($, baseUrl) => {
    const table = $('table')
      .filter((_, candidate) => /bill name/i.test($(candidate).find('thead').text()))
      .first();
    if (table.length === 0) return null;
    const rows = table
      .find('tbody > tr')
      .map((_, row): BillRow | null => {
        const cells = $(row).children('td');
        const link = cells.eq(1).find('a[href*="BillProgressPopup"]').first();
        const href = link.attr('href');
        if (!href) return null;
        return {
          url: new URL(href, baseUrl).href,
          title: squash(link.text()),
          text: `${squash(cells.eq(3).text())}.`,
          ...withDate(namedDate(squash(cells.eq(2).text()))),
        };
      })
      .get()
      .filter((row): row is BillRow => row !== null);
    // The view serves 30 rows a page unless the URL raises Count.
    const pageSize = Number(new URL(baseUrl).searchParams.get('Count') ?? 30);
    if (rows.length >= pageSize) throw new Error(`the WA bill list filled its page of ${pageSize} rows; raise Count in the source URL`);
    return rows;
  },
};

/** The AI-titled bills of a state bill list. */
export function extractFromBillList(list: BillListId, html: string, baseUrl: string): ExtractionResult {
  const rows = READERS[list](cheerio.load(html), baseUrl);
  if (!rows) return { itemCount: 0, candidates: [] };
  const candidates: Candidate[] = rows
    .filter(({ url, title, text }) => isRelevantScrapedCandidate({ url, title, text }))
    .map(({ url, title, text, introduced }) => ({ url, title, text, ...(introduced ? { dateHint: introduced, dateHintPrecision: 'day' as const } : {}) }));
  return { itemCount: rows.length, candidates, feedValid: true };
}
