import raw from './sector.json';

export type Org = {
  name: string;
  abbrev: string;
  tier: TierKey;
  jurisdiction: Jurisdiction;
  role: string;
  url: string;
  funded_by: string;
};

export type ScoredOrg = Org & { monitored: boolean };

export type TierKey =
  | 'peak'
  | 'legal_aid'
  | 'atsils'
  | 'fvpls'
  | 'clc'
  | 'profession'
  | 'court'
  | 'government'
  | 'funder'
  | 'academic'
  | 'tech_justice';

export type Jurisdiction =
  | 'national'
  | 'NSW'
  | 'VIC'
  | 'QLD'
  | 'WA'
  | 'SA'
  | 'TAS'
  | 'ACT'
  | 'NT';

// Display order is the sector's own hierarchy: who coordinates, then who delivers,
// then who supplies, funds and studies.
export const TIERS: Array<{ key: TierKey; label: string; blurb: string }> = [
  {
    key: 'peak',
    label: 'Peak & coordinating bodies',
    blurb: 'Speak for a slice of the sector. They coordinate, accredit and lobby — they do not run casework.',
  },
  {
    key: 'legal_aid',
    label: 'Legal Aid Commissions',
    blurb: 'Eight independent statutory bodies, one per state and territory. The largest single delivery arm.',
  },
  {
    key: 'atsils',
    label: 'Aboriginal & Torres Strait Islander Legal Services',
    blurb: 'Community-controlled, NATSILS members. Seven organisations, not the eight most directories still list.',
  },
  {
    key: 'fvpls',
    label: 'Family Violence Prevention Legal Services',
    blurb: 'Community-controlled services for First Nations victim-survivors, across roughly 40 sites.',
  },
  {
    key: 'clc',
    label: 'Community Legal Centres',
    blurb: 'The long tail: generalist centres by region, plus specialists by problem type — tenancy, welfare, disability, refugees, consumer.',
  },
  {
    key: 'profession',
    label: 'The profession',
    blurb: 'Law societies, bar associations, referral schemes and the firm pro bono practices that supply free capacity.',
  },
  {
    key: 'court',
    label: 'Courts & tribunals',
    blurb: 'Where a court can refer an unrepresented litigant to a pro bono lawyer, or runs a self-represented service.',
  },
  {
    key: 'government',
    label: 'Government, law reform & regulators',
    blurb: 'The departments that hold the purse, the commissions that propose reform, the regulators that police the profession.',
  },
  {
    key: 'funder',
    label: 'Funders',
    blurb: 'Philanthropic and statutory money that reaches the sector outside the Partnership.',
  },
  {
    key: 'academic',
    label: 'Research & clinical education',
    blurb: 'University clinics and research centres that both deliver services and produce the evidence base.',
  },
  {
    key: 'tech_justice',
    label: 'Technology & justice',
    blurb: 'Digital services, free-access-to-law infrastructure and legal tech aimed at the justice gap.',
  },
];

export const JURISDICTIONS: Jurisdiction[] = [
  'national',
  'NSW',
  'VIC',
  'QLD',
  'WA',
  'SA',
  'TAS',
  'ACT',
  'NT',
];

export const jurisdictionLabel = (j: Jurisdiction) => (j === 'national' ? 'National' : j);

export const ORGANISATIONS = raw.organisations as Org[];
export const COMPILED = raw.compiled as string;
export const RESEARCH_NOTES = raw.notes as string[];

/*
 * Names in the sector map and names in the sources table are written by different
 * hands ("Legal Aid Queensland" vs "Legal Aid QLD"), so matching them is fuzzy by
 * necessity. Strip the words that carry no distinguishing signal, then accept an
 * exact hit, a containment, or a high bigram similarity. It is deliberately
 * conservative: a missed match understates coverage, which is the safer error for
 * a page whose point is to show gaps.
 */
const NOISE =
  /\b(the|of|and|inc|incorporated|ltd|limited|australia|australian|commission|service|services|centre|center|news|media)\b/g;

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

// Sørensen–Dice over character bigrams: 1.0 identical, 0 nothing in common.
function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return (2 * shared) / (A.size + B.size);
}

export function markMonitored(orgs: Org[], sourceNames: string[]): ScoredOrg[] {
  const sources = sourceNames.map(norm).filter(Boolean);

  return orgs.map((o) => {
    const candidates = [o.name, o.abbrev].filter(Boolean).map(norm).filter(Boolean);
    const monitored = candidates.some((c) =>
      sources.some(
        (s) =>
          s === c ||
          (c.length >= 8 && (c.includes(s) || s.includes(c))) ||
          similarity(c, s) >= 0.86,
      ),
    );
    return { ...o, monitored };
  });
}

export function countBy<T extends string>(rows: Array<Record<string, unknown>>, key: string) {
  const out = {} as Record<T, number>;
  for (const r of rows) {
    const k = r[key] as T;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
