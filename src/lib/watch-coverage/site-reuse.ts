import { isValidCalendarDate } from '@/lib/calendar-date';
import { hostOf, type Host } from '@/lib/pipeline/host';
import type { Body } from './bodies';

/**
 * A Creative Commons licence as `CC-BY[-NC][-ND|-SA]-<version>[-AU]`. Unlike
 * article images, NC and ND are recorded: this describes what a site permits,
 * not what Policai may republish.
 */
export type CreativeCommonsId = string & { readonly __brand: 'CreativeCommonsId' };

export type ReuseTerms =
  | { kind: 'creative_commons'; licence: CreativeCommonsId; exceptions?: string }
  | { kind: 'all_rights_reserved'; summary: string }
  | { kind: 'custom'; summary: string };

/**
 * What a monitored site says about reusing its material, as last checked by
 * hand. `stated` cites the page that says it; `not_stated` means the site
 * publishes no copyright or licence statement we could find; `refused` means
 * the site would not serve Policai's declared identity, so it is unchecked.
 */
export type SiteReuse =
  | { host: Host; status: 'stated'; terms: ReuseTerms; termsUrl: string; checkedAt: string }
  | { host: Host; status: 'not_stated'; note: string; checkedAt: string }
  | { host: Host; status: 'refused'; note: string; checkedAt: string };

const CC_VARIANT = /^CC-(BY(?:-NC)?(?:-ND|-SA)?)-(\d\.\d)(?:-(AU))?$/;
const CC_VERSIONS: Readonly<Record<string, readonly string[]>> = {
  '': ['2.0', '2.5', '3.0', '4.0'],
  AU: ['2.0', '2.1', '2.5', '3.0'],
};

export interface CreativeCommonsTerms {
  label: string;
  url: string;
}

export function creativeCommonsTerms(id: string): CreativeCommonsTerms | undefined {
  const match = CC_VARIANT.exec(id);
  if (!match) return undefined;
  const [, variant, version, port = ''] = match;
  if (!CC_VERSIONS[port].includes(version)) return undefined;
  return {
    label: `CC ${variant} ${version}${port ? ` ${port}` : ''}`,
    url: `https://creativecommons.org/licenses/${variant.toLowerCase()}/${version}/${port ? `${port.toLowerCase()}/` : ''}`,
  };
}

/** One-line plain description of a site's terms, for tables and the policy page. */
export function reuseLabel(entry: SiteReuse): string {
  if (entry.status === 'refused') return 'Not checked: site refuses Policai';
  if (entry.status === 'not_stated') return 'No copyright statement found';
  const { terms } = entry;
  if (terms.kind === 'creative_commons') return creativeCommonsTerms(terms.licence)!.label;
  if (terms.kind === 'all_rights_reserved') return 'All rights reserved';
  return 'Custom terms';
}

/** The entry for the host a URL is on, if that host has been checked. */
export function reuseForUrl(entries: readonly SiteReuse[], url: string): SiteReuse | undefined {
  if (!URL.canParse(url)) return undefined;
  const host = hostOf(new URL(url));
  return entries.find((entry) => entry.host === host);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseTerms(raw: unknown, label: string): ReuseTerms {
  if (!isRecord(raw)) throw new Error(`${label}: terms must be an object`);
  if (raw.kind === 'creative_commons') {
    if (typeof raw.licence !== 'string' || !creativeCommonsTerms(raw.licence))
      throw new Error(`${label}: unknown Creative Commons licence ${String(raw.licence)}`);
    if (raw.exceptions !== undefined && !nonEmpty(raw.exceptions))
      throw new Error(`${label}: exceptions must be text when present`);
    return {
      kind: 'creative_commons',
      licence: raw.licence as CreativeCommonsId,
      ...(raw.exceptions ? { exceptions: raw.exceptions as string } : {}),
    };
  }
  if (raw.kind === 'all_rights_reserved' || raw.kind === 'custom') {
    if (!nonEmpty(raw.summary)) throw new Error(`${label}: ${raw.kind} terms need a summary`);
    return { kind: raw.kind, summary: raw.summary };
  }
  throw new Error(`${label}: invalid terms kind`);
}

/** Parses `data/site-reuse.json`, throwing on the first malformed entry. */
export function parseSiteReuse(raw: unknown): SiteReuse[] {
  if (!Array.isArray(raw)) throw new Error('siteReuse: expected an array');
  const seen = new Set<string>();
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`siteReuse[${index}]: expected an object`);
    const { host, status, checkedAt } = entry;
    if (typeof host !== 'string' || !nonEmpty(host)) throw new Error(`siteReuse[${index}]: missing host`);
    const label = `siteReuse:${host}`;
    if (seen.has(host)) throw new Error(`${label}: duplicate host`);
    seen.add(host);
    if (typeof checkedAt !== 'string' || !isValidCalendarDate(checkedAt))
      throw new Error(`${label}: checkedAt must be YYYY-MM-DD`);
    if (status === 'stated') {
      const { termsUrl } = entry;
      if (typeof termsUrl !== 'string' || !URL.canParse(termsUrl) || new URL(termsUrl).protocol !== 'https:')
        throw new Error(`${label}: termsUrl must be an https URL`);
      if (hostOf(new URL(termsUrl)) !== host) throw new Error(`${label}: termsUrl must be on ${host}`);
      return { host: host as Host, status, terms: parseTerms(entry.terms, label), termsUrl, checkedAt };
    }
    if (status === 'not_stated' || status === 'refused') {
      if (!nonEmpty(entry.note)) throw new Error(`${label}: ${status} needs a note`);
      return { host: host as Host, status, note: entry.note, checkedAt };
    }
    throw new Error(`${label}: invalid status`);
  });
}

/** Cross-file rules: every entry is a body's host; unchecked body hosts warn. */
export function siteReuseCoverage(
  entries: readonly SiteReuse[],
  bodies: readonly Body[],
): { errors: string[]; warnings: string[] } {
  const bodyHosts = new Set<string>(bodies.flatMap((body) => body.hosts));
  const checked = new Set<string>(entries.map((entry) => entry.host));
  return {
    errors: entries
      .filter((entry) => !bodyHosts.has(entry.host))
      .map((entry) => `siteReuse:${entry.host}: not a host of any body in bodies.json`),
    warnings: [...bodyHosts]
      .filter((host) => !checked.has(host))
      .map((host) => `siteReuse: ${host} has no recorded reuse terms`),
  };
}

export interface SiteReuseRow {
  host: Host;
  bodyNames: string[];
  jurisdiction: Body['jurisdiction'];
  tier: Body['tier'];
  entry: SiteReuse | undefined;
}

/** One row per body host, in bodies.json order, under its first body. */
export function siteReuseRows(
  bodies: readonly Body[],
  entries: readonly SiteReuse[],
): SiteReuseRow[] {
  const rows = new Map<string, SiteReuseRow>();
  for (const body of bodies) {
    for (const host of body.hosts) {
      const row = rows.get(host);
      if (row) row.bodyNames.push(body.name);
      else
        rows.set(host, {
          host,
          bodyNames: [body.name],
          jurisdiction: body.jurisdiction,
          tier: body.tier,
          entry: entries.find((entry) => entry.host === host),
        });
    }
  }
  return [...rows.values()];
}
