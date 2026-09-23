/*
 * Display rules for extracted deadlines. Pure: no database, no React, so the
 * rules are unit-tested directly (test/deadline-model.test.mjs).
 *
 * The worker applies the same label and legacy rules when it saves an
 * enrichment and when it builds the digest
 * (apps/probono/worker/src/lib/deadline-rules.ts). The packages are
 * independent, so keep both copies in step.
 */

export type DeadlineKind = 'action' | 'milestone';
export type Precision = 'day' | 'month' | 'year';

/* A deadline as stored in items.entities.deadlines. Legacy rows carry only
 * date, label and (usually) kind. */
export type StoredDeadline = {
  date: string;
  label: string;
  kind?: DeadlineKind;
  precision?: Precision;
  primary?: boolean;
  quote?: string;
  target_url?: string | null;
};

export type DeadlineItem = {
  id: number;
  title: string;
  url: string;
  published_at?: string | Date | null;
  deadlines: unknown;
};

export type SecondaryDate = { date: string; label: string; kind: DeadlineKind; precision: Precision };
export type ReportLink = { itemId: number; title: string; url: string };

/* One card on the page: a deadline, merged across every item reporting it. */
export type DeadlineCard = {
  key: string;
  itemId: number;
  title: string;
  url: string;
  date: string;
  label: string;
  kind: DeadlineKind;
  precision: Precision;
  alsoReportedBy: ReportLink[];
  secondary: SecondaryDate[];
};

export type DeadlineView = { closing: DeadlineCard[]; calendar: DeadlineCard[]; closed: DeadlineCard[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CLOSE_VERB_RE =
  /\b(close[sd]?|closing|due|deadline|lodge[sd]?|lodg(e|ing|ement)|apply by|register by|until|no later than|before \d|by (\d|5\s?pm|midnight|cob|close|mon|tue|wed|thu|fri|sat|sun))/i;
const NON_DEADLINE_RE =
  /\b(open(s|ed|ing)?|launch(es|ed|ing)?|meeting|webinar|event|forum|conference|symposium|summit|info(rmation)? session|workshop|hearing|agm|general meeting)\b/i;
const ACTION_LABEL_RE =
  /\b(close[sd]?|closing|due|deadline|submi|lodg|apply|register by|registrations? close|nominat|expressions? of interest|eoi|tender)/i;

export function looksLikeNonDeadline(...texts: (string | undefined)[]): boolean {
  const text = texts.filter(Boolean).join(' \n ');
  return NON_DEADLINE_RE.test(text) && !CLOSE_VERB_RE.test(text);
}

/* Openings, launches, meetings and events are never actions, whatever the
 * stored kind says. Rows with no kind fall back to the label. */
export function effectiveKind(d: Pick<StoredDeadline, 'kind' | 'label' | 'quote'>): DeadlineKind {
  if (looksLikeNonDeadline(d.label, d.quote)) return 'milestone';
  if (d.kind === 'action' || d.kind === 'milestone') return d.kind;
  return ACTION_LABEL_RE.test(d.label) ? 'action' : 'milestone';
}

/* Legacy rows have no precision; a bare 1 January there was the model's way
 * of writing "in <year>". */
export function effectivePrecision(d: Pick<StoredDeadline, 'date' | 'precision'>): Precision {
  if (d.precision === 'day' || d.precision === 'month' || d.precision === 'year') return d.precision;
  return d.date.slice(5) === '01-01' ? 'year' : 'day';
}

export function effectiveEnd(date: string, precision: Precision): string {
  const [y, m] = date.split('-').map(Number);
  if (precision === 'year') return `${y}-12-31`;
  if (precision === 'month') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
  }
  return date;
}

export function isLegacy(deadlines: StoredDeadline[]): boolean {
  return deadlines.every((d) => d.primary === undefined);
}

export function storedDeadlines(value: unknown): StoredDeadline[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (d): d is StoredDeadline =>
      !!d && typeof d === 'object' && typeof d.date === 'string' && DATE_RE.test(d.date) && typeof d.label === 'string',
  );
}

/*
 * The item's headline action date. New rows name it with `primary`; it counts
 * only as a day-precision action. Legacy rows take their latest day-precision
 * action: an earlier action date on the same item is usually an early-bird or
 * alternative-format date ahead of the real close.
 */
export function primaryIndex(deadlines: StoredDeadline[]): number {
  const isDayAction = (d: StoredDeadline) => effectiveKind(d) === 'action' && effectivePrecision(d) === 'day';
  if (!isLegacy(deadlines)) return deadlines.findIndex((d) => d.primary === true && isDayAction(d));
  let best = -1;
  deadlines.forEach((d, i) => {
    if (isDayAction(d) && (best < 0 || d.date > deadlines[best].date)) best = i;
  });
  return best;
}

/* ---------- merging duplicates across items ---------- */

const TRACKING = /^(utm_|fbclid|gclid|mc_cid|mc_eid)/;

export function canonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  return `${host}${path}${u.search}`;
}

export function isOfficial(url: string): boolean {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return /\.gov\.au$/.test(host) || /^consultations?\./.test(host) || /(^|\.)(aph|parliament)\./.test(host);
}

const STOPWORDS = new Set(
  'a an and are as at be by for from in into is it its of on or our the their this to with your you we'.split(' '),
);
/* Words every deadline label shares; they say nothing about which one it is. */
const GENERIC = new Set(
  ('submission close closing closed deadline due application apply consultation feedback ' +
    'date estimated final open lodge lodgement register registration have say view act law bill').split(' '),
);

const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export function labelTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u2018\u2019']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
  return new Set(words.filter((w) => !STOPWORDS.has(w) && !GENERIC.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export type DeadlineEntry = {
  itemId: number;
  title: string;
  url: string;
  publishedAt: number;
  date: string;
  label: string;
  kind: DeadlineKind;
  precision: Precision;
  own: string | null;
  target: string | null;
  tokens: Set<string>;
  secondary: SecondaryDate[];
};

function entryFor(item: DeadlineItem, d: StoredDeadline, secondary: SecondaryDate[] = []): DeadlineEntry {
  let tokens = labelTokens(d.label);
  // "Submissions close" names nothing; fall back to the headline as well.
  if (!tokens.size) tokens = labelTokens(`${d.label} ${item.title}`);
  const published = item.published_at ? new Date(item.published_at).getTime() : Number.NaN;
  return {
    itemId: item.id,
    title: item.title,
    url: item.url,
    publishedAt: Number.isFinite(published) ? published : Number.MAX_SAFE_INTEGER,
    date: d.date,
    label: d.label,
    kind: effectiveKind(d),
    precision: effectivePrecision(d),
    own: canonicalUrl(item.url),
    target: canonicalUrl(d.target_url),
    tokens,
    secondary,
  };
}

const hostOf = (link: string | null) => (link ? link.split('/')[0] : null);

function contained(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (!small.size) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

/*
 * Two entries are the same deadline when they fall on the same date and
 * - point at the same consultation page (one's target URL is the other's item
 *   or target URL), or
 * - their labels match closely: token-set Jaccard >= 0.6, generic deadline
 *   words ignored, or
 * - the same publisher repeats it in a shorter label ("Estimated deadline for
 *   scheme applications" beside "Application deadline for National Redress
 *   Scheme"): same site, and one label's tokens are all in the other's.
 */
export function sameDeadline(a: DeadlineEntry, b: DeadlineEntry): boolean {
  if (a.date !== b.date || a.precision !== b.precision) return false;
  if (a.itemId === b.itemId) return false;
  const aLinks = [a.own, a.target].filter(Boolean);
  if ([b.own, b.target].some((l) => l && aLinks.includes(l))) return true;
  if (jaccard(a.tokens, b.tokens) >= 0.6) return true;
  return hostOf(a.own) !== null && hostOf(a.own) === hostOf(b.own) && contained(a.tokens, b.tokens);
}

/* Card link preference: an official (.gov.au / consultation) page, then the
 * page other reports point at, then the earliest report. */
function survivorRank(e: DeadlineEntry, cluster: DeadlineEntry[]): number[] {
  const targeted = e.own !== null && cluster.some((o) => o !== e && o.target === e.own);
  return [isOfficial(e.url) ? 0 : 1, targeted ? 0 : 1, e.publishedAt, e.itemId];
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function mergeEntries(entries: DeadlineEntry[]): DeadlineCard[] {
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (sameDeadline(entries[i], entries[j])) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, DeadlineEntry[]>();
  entries.forEach((e, i) => {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket) bucket.push(e);
    else clusters.set(root, [e]);
  });

  const cards: DeadlineCard[] = [];
  for (const cluster of clusters.values()) {
    const ranked = [...cluster].sort((a, b) => compareRank(survivorRank(a, cluster), survivorRank(b, cluster)));
    const lead = ranked[0];
    const secondary = new Map<string, SecondaryDate>();
    for (const e of ranked) for (const s of e.secondary) secondary.set(`${s.date}|${s.label.toLowerCase()}`, s);
    cards.push({
      key: `${lead.date}:${lead.itemId}`,
      itemId: lead.itemId,
      title: lead.title,
      url: lead.url,
      date: lead.date,
      label: lead.label,
      kind: lead.kind,
      precision: lead.precision,
      alsoReportedBy: ranked
        .slice(1)
        .filter((e, i, all) => all.findIndex((o) => o.itemId === e.itemId) === i)
        .map((e) => ({ itemId: e.itemId, title: e.title, url: e.url })),
      secondary: [...secondary.values()].sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  return cards;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const byDate = (a: DeadlineCard, b: DeadlineCard) =>
  a.date.localeCompare(b.date) || a.precision.localeCompare(b.precision) || a.title.localeCompare(b.title);

/*
 * Split every item's dates into the three sections of /deadlines:
 * - closing: the item's primary day-precision action, today or later, one card
 *   per deadline with other future dates of the item as secondary lines;
 * - calendar: every other future date (milestones, month/year precision,
 *   non-primary dates of items with no closing card);
 * - closed: primary actions that passed in the last `closedDays` days.
 */
export function buildDeadlineView(items: DeadlineItem[], today: string, closedDays = 30): DeadlineView {
  const closing: DeadlineEntry[] = [];
  const calendar: DeadlineEntry[] = [];
  const closed: DeadlineEntry[] = [];
  const closedFrom = addDays(today, -closedDays);

  for (const item of items) {
    const deadlines = storedDeadlines(item.deadlines);
    const p = primaryIndex(deadlines);
    const primary = p >= 0 ? deadlines[p] : undefined;
    const future = deadlines
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) => i !== p && effectiveEnd(d.date, effectivePrecision(d)) >= today);

    if (primary && primary.date >= today) {
      // Day-precision dates ride under the closing card; vaguer dates belong
      // to the calendar only.
      const secondary = future
        .filter(({ d }) => effectivePrecision(d) === 'day')
        .map(({ d }) => ({ date: d.date, label: d.label, kind: effectiveKind(d), precision: 'day' as const }));
      closing.push(entryFor(item, primary, secondary));
      for (const { d } of future) if (effectivePrecision(d) !== 'day') calendar.push(entryFor(item, d));
      continue;
    }
    if (primary && primary.date < today && primary.date >= closedFrom) closed.push(entryFor(item, primary));
    for (const { d } of future) calendar.push(entryFor(item, d));
  }

  return {
    closing: mergeEntries(closing).sort(byDate),
    calendar: mergeEntries(calendar).sort(byDate),
    closed: mergeEntries(closed).sort((a, b) => byDate(b, a)),
  };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "16 Oct 2026", "Sep 2026" or "2027", per the precision the source gave. */
export function formatDeadlineDate(date: string, precision: Precision, withYear = true): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (precision === 'year') return date.slice(0, 4);
  // Fixed three-letter months: en-AU renders September as "Sept".
  if (precision === 'month') return `${MONTH_ABBR[d.getUTCMonth()]} ${date.slice(0, 4)}`;
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/* Machine-readable value for <time dateTime>. */
export function deadlineDateTime(date: string, precision: Precision): string {
  if (precision === 'year') return date.slice(0, 4);
  if (precision === 'month') return date.slice(0, 7);
  return date;
}
