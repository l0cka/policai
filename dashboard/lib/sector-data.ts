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

// Ordered by function: coordination, delivery, supply, funding, research.
export const TIERS: Array<{ key: TierKey; label: string; blurb: string }> = [
  {
    key: 'peak',
    label: 'Peak & coordinating bodies',
    blurb: 'National and state representative bodies. Policy, accreditation and advocacy; no casework.',
  },
  {
    key: 'legal_aid',
    label: 'Legal Aid Commissions',
    blurb: 'Independent statutory bodies, one per state and territory.',
  },
  {
    key: 'atsils',
    label: 'Aboriginal & Torres Strait Islander Legal Services',
    blurb: 'Community-controlled legal services. NATSILS members.',
  },
  {
    key: 'fvpls',
    label: 'Family Violence Prevention Legal Services',
    blurb: 'Community-controlled services for First Nations victim-survivors of family violence. Around 40 sites.',
  },
  {
    key: 'clc',
    label: 'Community Legal Centres',
    blurb: 'Generalist centres by region and specialist centres by problem type.',
  },
  {
    key: 'profession',
    label: 'The profession',
    blurb: 'Law societies, bar associations, pro bono referral schemes and law firm pro bono practices.',
  },
  {
    key: 'court',
    label: 'Courts & tribunals',
    blurb: 'Courts and tribunals with a pro bono referral rule or a self-represented litigant service.',
  },
  {
    key: 'government',
    label: 'Government, law reform & regulators',
    blurb: 'Funding departments, law reform commissions and legal profession regulators.',
  },
  {
    key: 'funder',
    label: 'Funders',
    blurb: 'Philanthropic and statutory funders of legal assistance.',
  },
  {
    key: 'academic',
    label: 'Research & clinical education',
    blurb: 'University law clinics and access-to-justice research centres.',
  },
  {
    key: 'tech_justice',
    label: 'Technology & justice',
    blurb: 'Digital legal services, free-access-to-law infrastructure and legal technology bodies.',
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
 * A source is an organisation's own website, so the website is what identifies
 * it. Match on host.
 *
 * Name matching was tried first and is not viable: the distinguishing words in
 * this sector are exactly the common ones. Stripping them to compare loosely
 * turns "Australian Pro Bono Centre" into "pro bono", which then matches every
 * pro bono scheme in the country; keeping them means "Legal Aid Queensland" and
 * "Legal Aid QLD" never meet. Hosts have neither problem.
 */
function host(u: string): string {
  if (!u || !/^https?:\/\//i.test(u)) return '';
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Same site, allowing a source to sit on a subdomain of the organisation's
 * domain (consultations.ag.gov.au belongs to ag.gov.au). The suffix rule needs
 * three or more labels on the shorter host, so a public suffix like gov.au can
 * never claim every source beneath it.
 */
function sameSite(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return (short.match(/\./g) ?? []).length >= 2 && long.endsWith('.' + short);
}

// Fallback for the handful of sources whose feed lives on a different domain
// than the one the sector map recorded. Exact match only — no loosening.
function exactName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function markMonitored(orgs: Org[], sources: Array<{ name: string; url: string }>): ScoredOrg[] {
  const hosts = sources.map((s) => host(s.url)).filter(Boolean);
  const names = new Set(sources.map((s) => exactName(s.name)).filter(Boolean));

  return orgs.map((o) => {
    const oh = host(o.url);
    const monitored =
      hosts.some((h) => sameSite(oh, h)) || names.has(exactName(o.name));
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
