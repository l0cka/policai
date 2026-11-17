import { auDate } from '@/lib/au-date';
import { formatPolicyDate } from '@/lib/format-policy-date';
import { SITE_URL } from '@/lib/site-seo';
import {
  getPrimaryPolicyDate,
  POLICY_TYPE_NAMES,
  type Jurisdiction,
  type Policy,
  type PolicyType,
} from '@/types';

type CitableRecord = Pick<
  Policy,
  | 'id'
  | 'title'
  | 'jurisdiction'
  | 'type'
  | 'dates'
  | 'effectiveDate'
  | 'agencies'
  | 'sourceUrl'
  | 'lastReviewedAt'
>;

type CitationPattern = 'short_title' | 'document';

const CITATION_PATTERNS: Record<PolicyType, CitationPattern> = {
  legislation: 'short_title',
  regulation: 'short_title',
  guideline: 'document',
  framework: 'document',
  standard: 'document',
  practice_note: 'document',
  policy: 'document',
  tool: 'document',
  funding_program: 'document',
};

const JURISDICTION_ABBREVIATIONS: Record<Jurisdiction, string> = {
  federal: 'Cth',
  nsw: 'NSW',
  vic: 'Vic',
  qld: 'Qld',
  wa: 'WA',
  sa: 'SA',
  tas: 'Tas',
  act: 'ACT',
  nt: 'NT',
};

const ENDS_IN_YEAR = /\s\d{4}$/;

function authors(agencies: string[]): string {
  if (agencies.length > 3) return `${agencies[0]} et al`;
  if (agencies.length < 2) return agencies.join('');
  return `${agencies.slice(0, -1).join(', ')} and ${agencies[agencies.length - 1]}`;
}

function documentCitation(record: CitableRecord): string {
  const author = authors(record.agencies);
  const date = formatPolicyDate(getPrimaryPolicyDate(record));
  return [
    author ? `${author},` : '',
    record.title.trim(),
    `(${POLICY_TYPE_NAMES[record.type]}, ${date})`,
    record.sourceUrl ? `<${record.sourceUrl}>` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const CITE: Record<CitationPattern, (record: CitableRecord) => string> = {
  short_title: (record) =>
    ENDS_IN_YEAR.test(record.title.trim())
      ? `${record.title.trim()} (${JURISDICTION_ABBREVIATIONS[record.jurisdiction]})`
      : documentCitation(record),
  document: documentCitation,
};

function permalink(record: CitableRecord): string {
  const verified = record.lastReviewedAt
    ? `, verified ${auDate(new Date(record.lastReviewedAt), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Australia/Sydney',
      })}`
    : '';
  return `${record.title.trim()} <${SITE_URL}/policies/${record.id}> (as recorded by Policai${verified})`;
}

export function citeRecord(record: CitableRecord): { citation: string; permalink: string } {
  return {
    citation: CITE[CITATION_PATTERNS[record.type]](record),
    permalink: permalink(record),
  };
}
