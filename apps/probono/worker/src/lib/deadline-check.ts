import { effectiveEnd, effectiveKind, effectivePrecision, primaryAction, type StoredDeadline } from './deadline-rules.js';
import type { Verdict, VerifyItem } from './deadline-verify.js';

/*
 * Deterministic deadline check: find each stored date in the page text, take
 * its sentence as the quote, and read kind and status from the words beside
 * it. A date whose kind or primary flag the words don't settle gets no
 * verdict, so applyVerification leaves it exactly as stored.
 */

export const CHECKER_MODEL = 'deterministic-v1';

export type DateCheck = { verdict: Verdict | null; uncertain: string | null };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const ORD = '(?:st|nd|rd|th)?';
const WEEKDAY = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday)?\\.?,?\\s+)?';

const ACTION_RE =
  /\b(close[sd]?|closing|submi(t|ts|tted|ssions?)|apply|applications? (close|due)|lodge[sd]?|lodg(ing|ement)|register(ed)? by|registrations? close|deadline|due|rsvp( by)?|nominations? close|eoi|expressions? of interest|until|no later than|cut-?off)\b/gi;
const MILESTONE_RE =
  /\b(open(s|ed|ing)?|commenc(e|es|ed|ement|ing)|start(s|ed|ing)?|launch(es|ed|ing)?|event|expo|forum|webinar|conference|symposium|summit|workshop|hearing|info(rmation)? session|agm|general meeting|released?|takes? effect|comes? into (force|effect)|in force|election|held on|meeting|ceremony|festival)\b/gi;
const PRIMARY_RE = /\b(close[sd]?|closing|submi|deadline|due|until)/i;
// "Date: Friday 23 October 2026" heads an event listing.
const DATE_HEADER_RE = /(?:^|\n)[ \t>*#-]*(?:event\s+)?date\s*:\s*$/i;
const CLOSED_RE = /\b(has|have|had) (now )?closed|\bnow closed|\bis closed|\bclosed on\b|\bsubmissions? closed|\bapplications? closed|\bconsultation (has )?closed/i;
const EXTENDED_RE = /\bextended\b|\bnew closing date\b|\bpostponed\b/gi;
const NEGATION_RE = /(\bnot|\bcannot|\bnever|\bno longer|n't)\b[^.!?\n]{0,15}$/i;
// A close word a "Date:" heading yields to; "until" there is usually a clock time.
const HEADER_ACTION_RE = /\b(close[sd]?|closing|submi|deadline|due\b|lodg|apply|register(ed)? by|registrations? close|rsvp)/i;
const EXTENSION_SUBJECT_RE = /\b(close[sd]?|closing|deadline|submissions?|applications?)\b/i;

// Keyword reach either side of a date, in characters.
const BEFORE_REACH = 40;
const AFTER_REACH = 30;
const QUOTE_LIMIT = 300;

type Hit = { index: number; end: number; precision: 'day' | 'month' | 'year' };
type Span = { start: number; end: number };

const pad = (n: number) => String(n).padStart(2, '0');

export function cleanText(text: string): string {
  return text.replace(/\*\*|__/g, '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
}

function findDate(text: string, date: string, precision: 'day' | 'month' | 'year'): Hit[] {
  const [y, m, d] = date.split('-').map(Number);
  const lower = text.toLowerCase();
  const hits: Hit[] = [];
  const add = (re: RegExp, matches: (mm: RegExpMatchArray) => boolean) => {
    for (const mm of lower.matchAll(re)) {
      if (matches(mm)) hits.push({ index: mm.index!, end: mm.index! + mm[0].length, precision });
    }
  };
  const yearOk = (year: string | undefined, end: number) => {
    if (year) return Number(year) === y;
    // "2 November" with no year: fine unless a different year follows it.
    const next = lower.slice(end, end + 12).match(/^\s*,?\s*(\d{4})\b/);
    return !next || Number(next[1]) === y;
  };
  if (precision === 'day') {
    add(new RegExp(`\\b${y}-${pad(m)}-${pad(d)}\\b`, 'g'), () => true);
    add(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/g, (mm) =>
      Number(mm[1]) === d && Number(mm[2]) === m && (Number(mm[3]) === y || Number(mm[3]) === y % 100));
    add(new RegExp(`\\b${WEEKDAY}(\\d{1,2})${ORD}(?:\\s+of)?\\s+(${MON})\\b\\.?(?:,?\\s+(\\d{4}))?`, 'g'), (mm) =>
      Number(mm[1]) === d && MONTHS[mm[2]] === m && yearOk(mm[3], mm.index! + mm[0].length));
    add(new RegExp(`\\b${WEEKDAY}(${MON})\\.?\\s+(\\d{1,2})${ORD}\\b(?:,?\\s+(\\d{4}))?`, 'g'), (mm) =>
      Number(mm[2]) === d && MONTHS[mm[1]] === m && yearOk(mm[3], mm.index! + mm[0].length));
    add(new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:[–—-]|to)\\s*(\\d{1,2})${ORD}\\s+(${MON})\\b(?:,?\\s+(\\d{4}))?`, 'g'), (mm) =>
      (Number(mm[1]) === d || Number(mm[2]) === d) && MONTHS[mm[3]] === m && yearOk(mm[4], mm.index! + mm[0].length));
  } else if (precision === 'month') {
    add(new RegExp(`\\b(${MON})\\.?,?\\s+(\\d{4})\\b`, 'g'), (mm) => MONTHS[mm[1]] === m && Number(mm[2]) === y);
  } else {
    add(new RegExp(`\\b(in|by|during|from|until)\\s+${y}\\b`, 'g'), () => true);
  }
  // "10–12 December" also matches "12 December"; one phrase is one mention.
  const mentions: Hit[] = [];
  for (const h of hits.sort((a, b) => a.index - b.index || b.end - a.end)) {
    if (h.index >= (mentions.at(-1)?.end ?? 0)) mentions.push(h);
  }
  return mentions;
}

// Punctuation at i ends a sentence, unless it closes a one-letter
// abbreviation such as the "m." of "5 p.m.".
function endsSentence(text: string, i: number): boolean {
  if (!/[.!?]/.test(text[i] ?? '')) return false;
  return !(text[i] === '.' && /[a-z]/i.test(text[i - 1] ?? '') && !/[a-z]/i.test(text[i - 2] ?? ''));
}

/* The sentence or line holding the date, capped at QUOTE_LIMIT characters. */
function sentenceAround(text: string, hit: { index: number; end: number }): Span {
  let start = hit.index;
  while (start > 0 && text[start - 1] !== '\n' && !(/\s/.test(text[start - 1]) && endsSentence(text, start - 2))) start--;
  let end = hit.end;
  while (end < text.length && text[end] !== '\n' && !(endsSentence(text, end) && /\s|$/.test(text[end + 1] ?? ''))) end++;
  if (end < text.length && /[.!?]/.test(text[end])) end++;
  if (end - start > QUOTE_LIMIT) {
    start = Math.max(start, hit.index - 150);
    end = Math.min(end, start + QUOTE_LIMIT);
  }
  return { start, end };
}

function nearest(re: RegExp, text: string, span: Span, hit: Hit): { distance: number; within: boolean } | null {
  let best: { distance: number; within: boolean } | null = null;
  for (const mm of text.slice(span.start, span.end).matchAll(re)) {
    const s = span.start + mm.index!;
    const e = s + mm[0].length;
    const before = e <= hit.index;
    const distance = before ? hit.index - e : Math.max(0, s - hit.end);
    const within = before ? distance <= BEFORE_REACH : distance <= AFTER_REACH;
    if (!best || distance < best.distance) best = { distance, within };
  }
  return best;
}

function kindAt(text: string, hit: Hit, sentence: Span): 'action' | 'milestone' | null {
  const lineStart = text.lastIndexOf('\n', hit.index - 1) + 1;
  const lead = text.slice(Math.max(lineStart - 1, 0), hit.index).replace(/\b(mon|tue|wed|thu|fri|sat|sun)\w*,?\s*$/i, '');
  const clause = { start: Math.max(sentence.start, text.lastIndexOf(';', hit.index) + 1), end: sentence.end };
  if (DATE_HEADER_RE.test(lead) && !HEADER_ACTION_RE.test(text.slice(clause.start, clause.end))) return 'milestone';
  const action = nearest(ACTION_RE, text, clause, hit);
  const milestone = nearest(MILESTONE_RE, text, clause, hit);
  if (action?.within && !(milestone?.within && milestone.distance <= action.distance)) return 'action';
  if (milestone?.within && !(action?.within && action.distance <= milestone.distance)) return 'milestone';
  return null;
}

function nextSentenceStart(text: string, sentence: Span): number {
  let i = sentence.end;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/*
 * The new date when the date's sentence, or the one after it, says a close
 * was "extended to", "postponed until" or has a "new closing date" of a later
 * date, with the date straight after that wording. Negated wording ("cannot
 * be extended") and other things postponed ("the forum was postponed") don't
 * count.
 */
function extendedTo(text: string, sentence: Span, stored: string): { date: string; hit: Hit } | null {
  const [year, storedMonth] = stored.split('-').map(Number);
  const region = { start: sentence.start, end: Math.min(text.length, sentence.end + 200) };
  const dateAfter = new RegExp(
    `^\\s*(?:(?:to|until|till|is|of|:)\\s*)?(?:${WEEKDAY})?(?:(\\d{1,2})${ORD}(?:\\s+of)?\\s+(${MON})|(${MON})\\.?\\s+(\\d{1,2})${ORD})\\b\\.?(?:,?\\s+(\\d{4}))?`,
    'i',
  );
  for (const word of text.slice(region.start, region.end).matchAll(EXTENDED_RE)) {
    const at = region.start + word.index!;
    const wordSentence = sentenceAround(text, { index: at, end: at + word[0].length });
    if (wordSentence.start > nextSentenceStart(text, sentence)) continue;
    const lead = text.slice(wordSentence.start, at);
    if (NEGATION_RE.test(lead) || !EXTENSION_SUBJECT_RE.test(`${lead}${word[0]}`)) continue;
    const from = at + word[0].length;
    const mm = text.slice(from, wordSentence.end).match(dateAfter);
    if (!mm) continue;
    const day = Number(mm[1] ?? mm[4]);
    const month = MONTHS[(mm[2] ?? mm[3]).toLowerCase()];
    // "extended to 15 January" from a December date means next January.
    const y = mm[5] ? Number(mm[5]) : month < storedMonth ? year + 1 : year;
    const date = `${y}-${pad(month)}-${pad(day)}`;
    if (date <= stored) continue;
    return { date, hit: { index: from, end: from + mm[0].length, precision: 'day' } };
  }
  return null;
}

export function checkDeadlines(item: VerifyItem, pageText: string, today: string): DateCheck[] {
  const text = cleanText(pageText);
  const storedPrimary = primaryAction(item.deadlines);
  const checks = item.deadlines.map((s: StoredDeadline): DateCheck & { quoteHasClose?: boolean } => {
    const base = { date: s.date, corrected_date: null, label: s.label, target_url: s.target_url ?? null };
    const hits = findDate(text, s.date, effectivePrecision(s));
    if (hits.length === 0) {
      return {
        verdict: { ...base, kind: effectiveKind(s), precision: null, primary: false, quote: '', status: 'not_found' },
        uncertain: null,
      };
    }
    const read = hits.map((hit) => {
      const sentence = sentenceAround(text, hit);
      return { hit, sentence, kind: kindAt(text, hit, sentence) };
    });
    // A page can mention one date several times ("commence on 10 December",
    // "by the 10 December deadline"); the kind most mentions agree on wins.
    const actions = read.filter((r) => r.kind === 'action').length;
    const milestones = read.filter((r) => r.kind === 'milestone').length;
    if (actions === 0 && milestones === 0) return { verdict: null, uncertain: `${s.date} left unchanged: no deadline or event wording beside the date` };
    if (actions === milestones) return { verdict: null, uncertain: `${s.date} left unchanged: mentions disagree on deadline or event` };
    const pick = read.find((r) => r.kind === (actions > milestones ? 'action' : 'milestone'))!;
    const extension = extendedTo(text, pick.sentence, s.date);
    // The saver wants the quote to show the date it stores, so an extension
    // quotes the sentence with the new date.
    const quoted = extension ? sentenceAround(text, extension.hit) : pick.sentence;
    const quote = text.slice(quoted.start, quoted.end).trim();
    const passed = effectiveEnd(s.date, pick.hit.precision) < today;
    const status = extension ? 'extended' : passed || CLOSED_RE.test(quote) ? 'closed' : 'open';
    return {
      verdict: { ...base, corrected_date: extension?.date ?? null, kind: pick.kind!, precision: pick.hit.precision, primary: false, quote, status },
      uncertain: null,
      quoteHasClose: PRIMARY_RE.test(quote),
    };
  });

  const actions = checks.filter((c) => c.verdict?.kind === 'action' && c.verdict.status !== 'not_found');
  const closing = actions.filter((c) => c.quoteHasClose);
  const primary = actions.length === 1 ? actions[0] : closing.length === 1 ? closing[0] : null;
  if (primary) primary.verdict!.primary = true;
  else if (actions.length > 1) {
    // Several action dates and nothing to pick between them: leave the stored
    // primary as it was.
    for (const c of actions) c.verdict!.primary = item.deadlines[checks.indexOf(c)] === storedPrimary;
    if (!storedPrimary) for (const c of actions) c.uncertain = `${c.verdict!.date}: several action dates and none marked main, so none is primary`;
  }
  return checks.map(({ verdict, uncertain }) => ({ verdict, uncertain }));
}
