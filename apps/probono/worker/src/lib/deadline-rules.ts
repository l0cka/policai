import { z } from 'zod';

/*
 * Deadline rules shared by the enrichment saver and the digest.
 *
 * The dashboard keeps a display-side copy of the label rules and the legacy
 * normalisation in apps/probono/dashboard/lib/deadline-model.ts. The two
 * packages are independent, so keep both copies in step.
 */

export const PRECISIONS = ['day', 'month', 'year'] as const;
export type Precision = (typeof PRECISIONS)[number];
export type DeadlineKind = 'action' | 'milestone';

/* The shape new enrichment must emit for each date. */
export const DeadlineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(300),
  kind: z.enum(['action', 'milestone']),
  precision: z.enum(PRECISIONS),
  primary: z.boolean(),
  quote: z.string().min(1).max(300),
  /* The consultation or application page, when the item links to one. */
  target_url: z.string().max(2000).nullable().optional(),
});
export type Deadline = z.infer<typeof DeadlineSchema>;

/* Stored rows written before precision/primary/quote existed. */
export type StoredDeadline = {
  date: string;
  label: string;
  kind?: DeadlineKind;
  precision?: Precision;
  primary?: boolean;
  quote?: string;
  target_url?: string | null;
  /* Set by the deadline verifier: closed/not_found dates are not chaseable. */
  status?: 'open' | 'closed' | 'extended' | 'not_found';
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

/*
 * A reader acts by a date only when the text says something closes or is due.
 * Openings, launches, meetings and events are dates that arrive; with no close
 * verb beside them they are milestones whatever the model called them.
 */
export const CLOSE_VERB_RE =
  /\b(close[sd]?|closing|due|deadline|lodge[sd]?|lodg(e|ing|ement)|apply by|register by|until|no later than|before \d|by (\d|5\s?pm|midnight|cob|close|mon|tue|wed|thu|fri|sat|sun))/i;
export const NON_DEADLINE_RE =
  /\b(open(s|ed|ing)?|launch(es|ed|ing)?|meeting|webinar|event|forum|conference|symposium|summit|info(rmation)? session|workshop|hearing|agm|general meeting)\b/i;
const ACTION_LABEL_RE =
  /\b(close[sd]?|closing|due|deadline|submi|lodg|apply|register by|registrations? close|nominat|expressions? of interest|eoi|tender)/i;

export function looksLikeNonDeadline(...texts: (string | undefined)[]): boolean {
  const text = texts.filter(Boolean).join(' \n ');
  return NON_DEADLINE_RE.test(text) && !CLOSE_VERB_RE.test(text);
}

/* Kind for stored rows: explicit kind, overridden by the non-deadline guard. */
export function effectiveKind(d: Pick<StoredDeadline, 'kind' | 'label' | 'quote'>): DeadlineKind {
  if (looksLikeNonDeadline(d.label, d.quote)) return 'milestone';
  if (d.kind) return d.kind;
  return ACTION_LABEL_RE.test(d.label) ? 'action' : 'milestone';
}

/*
 * Rows without a precision predate the field. The model then had nowhere to put
 * "in 2027" and wrote 1 January, so treat a bare 1 January as year precision;
 * every other legacy date is taken at face value.
 */
export function effectivePrecision(d: Pick<StoredDeadline, 'date' | 'precision'>): Precision {
  if (d.precision) return d.precision;
  return d.date.slice(5) === '01-01' ? 'year' : 'day';
}

/* Last calendar day the date could refer to, as YYYY-MM-DD. */
export function effectiveEnd(date: string, precision: Precision): string {
  const [y, m] = date.split('-').map(Number);
  if (precision === 'year') return `${y}-12-31`;
  if (precision === 'month') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
  }
  return date;
}

export function sydneyToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

function isRealDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/*
 * True when the quote names the date's day and month: "16 October 2026",
 * "Friday 16 October", "16th of Oct", "October 16", "16/10/2026", "2026-10-16".
 * The year is not required; quotes often omit it.
 */
export function quoteHasDay(quote: string, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const q = quote.toLowerCase();
  const iso = new RegExp(`\\b${y}-0?${m}-0?${d}\\b`);
  if (iso.test(q)) return true;
  for (const match of q.matchAll(/\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/g)) {
    if (Number(match[1]) === d && Number(match[2]) === m) return true;
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_RE})\\b\\.?`, 'g');
  for (const match of q.matchAll(dayFirst)) {
    if (Number(match[1]) === d && MONTHS[match[2]] === m) return true;
  }
  const monthFirst = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g');
  for (const match of q.matchAll(monthFirst)) {
    if (Number(match[2]) === d && MONTHS[match[1]] === m) return true;
  }
  return false;
}

export type DroppedDeadline = { deadline: unknown; reason: string };
export type VettedDeadlines = { kept: Deadline[]; dropped: DroppedDeadline[]; notes: string[] };

const describe = (raw: unknown) => {
  const r = raw as { date?: unknown; label?: unknown };
  return `${String(r?.date ?? '?')} "${String(r?.label ?? '?')}"`;
};

/*
 * Check each extracted date on its own. A bad date is dropped with a reason;
 * it never fails the item, so the rest of the enrichment still lands.
 */
export function vetDeadlines(
  raw: unknown[],
  now: Date = new Date(),
  /* The verifier re-reads items whose deadline has passed; enrichment never keeps one. */
  { allowPast = false }: { allowPast?: boolean } = {},
): VettedDeadlines {
  const today = sydneyToday(now);
  const kept: Deadline[] = [];
  const dropped: DroppedDeadline[] = [];
  const notes: string[] = [];

  for (const item of raw) {
    const parsed = DeadlineSchema.safeParse(item);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join('.') || i.message).join(', ');
      dropped.push({ deadline: item, reason: `invalid deadline fields: ${fields}` });
      continue;
    }
    const d = { ...parsed.data, quote: parsed.data.quote.trim(), label: parsed.data.label.trim() };
    // A malformed link is not worth losing the date over.
    d.target_url = d.target_url && /^https?:\/\/\S+$/i.test(d.target_url.trim()) ? d.target_url.trim() : null;
    if (!isRealDate(d.date)) {
      dropped.push({ deadline: item, reason: `not a calendar date: ${d.date}` });
      continue;
    }
    if (d.precision === 'month') d.date = `${d.date.slice(0, 7)}-01`;
    if (d.precision === 'year') d.date = `${d.date.slice(0, 4)}-01-01`;
    if (d.precision === 'day' && !quoteHasDay(d.quote, d.date)) {
      dropped.push({ deadline: item, reason: `day precision but the quote does not name ${d.date}` });
      continue;
    }
    if (!allowPast && effectiveEnd(d.date, d.precision) < today) {
      dropped.push({ deadline: item, reason: `date already passed at enrichment (${today})` });
      continue;
    }
    if (d.kind === 'action' && looksLikeNonDeadline(d.label, d.quote)) {
      d.kind = 'milestone';
      notes.push(`${describe(d)}: opening/event wording with no close verb; kind set to milestone`);
    }
    if (d.primary && d.kind !== 'action') {
      d.primary = false;
      notes.push(`${describe(d)}: a milestone cannot be the primary deadline; primary cleared`);
    }
    kept.push(d);
  }

  const primaries = kept.filter((d) => d.primary);
  if (primaries.length > 1) {
    for (const d of primaries) d.primary = false;
    notes.push(`${primaries.length} dates were marked primary; at most one is allowed, so none is primary`);
  }
  return { kept, dropped, notes };
}

/* ---- Digest selection: the same rules the dashboard's "Closing soon" uses. ---- */

export type DigestSourceItem = { title: string; entities?: { deadlines?: unknown } | null };
export type DigestDeadline = { date: string; label: string; itemTitle: string };

function storedDeadlines(value: unknown): StoredDeadline[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (d): d is StoredDeadline =>
      !!d && typeof d === 'object' && typeof (d as StoredDeadline).date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test((d as StoredDeadline).date) && typeof (d as StoredDeadline).label === 'string',
  );
}

/*
 * The item's headline action date. New rows name it with `primary`. Legacy
 * rows (no `primary` on any date) take their latest day-precision action date:
 * earlier dates on the same item are usually early-bird or alternative-format
 * dates ahead of the real close.
 */
export function primaryAction(deadlines: StoredDeadline[]): StoredDeadline | undefined {
  const legacy = deadlines.every((d) => d.primary === undefined);
  const actions = deadlines.filter(
    (d) => effectiveKind(d) === 'action' && effectivePrecision(d) === 'day',
  );
  if (!legacy) return actions.find((d) => d.primary === true);
  return actions.sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function selectDigestDeadlines(items: DigestSourceItem[], today: string): DigestDeadline[] {
  const seen = new Set<string>();
  const out: DigestDeadline[] = [];
  for (const item of items) {
    const primary = primaryAction(storedDeadlines(item.entities?.deadlines));
    if (!primary || primary.date < today || primary.status === 'closed' || primary.status === 'not_found') continue;
    const key = `${primary.date}|${primary.label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date: primary.date, label: primary.label, itemTitle: item.title });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
