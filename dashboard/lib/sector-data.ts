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

/*
 * Verified 2026-08-12 against current first-party directories and program
 * pages. Keeping the corrections here makes them reviewable without rewriting
 * the generated, minified source file. The next full sector-data regeneration
 * should fold these changes into sector.json and retire this block.
 */
const VERIFIED_REMOVALS = new Set([
  // Historical name of Law Firms Australia, not a second constituent body.
  'Large Law Firm Group',
  // Same legal entity and website as the FVPLS record retained below.
  "Marninwarntikura Women's Resource Centre",
]);

const VERIFIED_OVERRIDES: Record<string, Partial<Org>> = {
  'Legal Aid Queensland': {
    funded_by: 'Commonwealth NAJP 2025–30 funding and Queensland Government funding',
  },
  'Community Legal Centres Australia': {
    funded_by: 'Commonwealth Community Legal Services Program 2025–30 grant (outside the NAJP)',
  },
  'National Aboriginal and Torres Strait Islander Legal Services': {
    funded_by: 'Commonwealth Community Legal Services Program 2025–30 grant (outside the NAJP)',
  },
  'First Nations Advocates Against Family Violence': {
    funded_by: 'Commonwealth Community Legal Services Program 2025–30 grant (outside the NAJP)',
  },
  "Women's Legal Services Australia": {
    funded_by: 'Commonwealth Community Legal Services Program 2025–30 grant (outside the NAJP)',
  },
  LawRight: {
    tier: 'clc',
    role:
      "Accredited Queensland community legal centre and pro bono clearing house; operates Pro Bono Connect and court and tribunal self-representation services.",
    funded_by:
      'Commonwealth Community Legal Services Program 2025–30, Commonwealth and Queensland legal-assistance funding, and private or philanthropic support',
  },
  'JusticeNet SA': {
    tier: 'clc',
    role:
      "Accredited South Australian community legal centre and pro bono clearing house; operates referral, discrete-assistance and self-representation services.",
    funded_by:
      'Commonwealth Community Legal Services Program 2025–30, South Australian Government, member and philanthropic support',
  },
  'High Court of Australia': {
    role:
      'Australia\'s apex court. Its December 2024 protocol permits the Court to refer requests for pro bono assistance or appoint an amicus curiae through the Australian Bar Association.',
  },
};

const VERIFIED_ADDITIONS: Org[] = [
  {
    name: 'ACT Association of Community Legal Centres',
    abbrev: 'ACTACLC',
    tier: 'peak',
    jurisdiction: 'ACT',
    role:
      'Territory association recognised by Community Legal Centres Australia as the ACT peak for the community legal sector.',
    url: 'https://www.actlawsociety.asn.au/for-the-public/legal-help/community-legal-centres',
    funded_by: 'Member and sector support',
  },
  {
    name: 'Northern Territory Association of Community Legal Centres',
    abbrev: 'NTACLC',
    tier: 'peak',
    jurisdiction: 'NT',
    role:
      'Territory peak strengthening the community legal sector through collaboration, training, policy work and access-to-justice advocacy.',
    url: 'https://www.dcls.org.au/about-ntaclc',
    funded_by: 'Member and sector support',
  },
];

// Ordered by function: coordination, delivery, supply, funding, research.
export const TIERS: Array<{ key: TierKey; label: string; blurb: string }> = [
  {
    key: 'peak',
    label: 'Peak & coordinating bodies',
    blurb: 'National and jurisdictional representative and coordinating bodies; some also host sector-support projects.',
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
    label: 'Family Violence Prevention and Legal Services',
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
    blurb: 'Selected courts and tribunals relevant to pro bono referrals or self-represented litigant support; arrangements vary.',
  },
  {
    key: 'government',
    label: 'Government, law reform & regulators',
    blurb: 'Funding departments, law reform commissions and legal profession regulators.',
  },
  {
    key: 'funder',
    label: 'Funders',
    blurb: 'Selected philanthropic and statutory funders with documented legal-assistance or justice support.',
  },
  {
    key: 'academic',
    label: 'Research & clinical education',
    blurb: 'Selected university clinics and access-to-justice research centres; not a census of Australian law schools.',
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

const RAW_ORGANISATIONS = raw.organisations as Org[];

export const ORGANISATIONS = [
  ...RAW_ORGANISATIONS.filter((org) => !VERIFIED_REMOVALS.has(org.name)).map((org) => ({
    ...org,
    ...VERIFIED_OVERRIDES[org.name],
  })),
  ...VERIFIED_ADDITIONS,
];
export const COMPILED = '2026-08-12';
const STALE_NOTE_MARKERS = [
  'NATIONAL PRO BONO TARGET (as requested)',
  'SOURCES WORKED THROUGH (real member directories, not recall)',
];

export const RESEARCH_NOTES = [
  'ACCURACY PASS 2026-08-12: Core NAJP claims were checked against the signed agreement and Attorney-General\'s Department material. Provider categories were checked against National Legal Aid, CLCs Australia, WLSA, NATSILS and FNAAFV. The WLS map filter now follows WLSA\'s 13-service directory; ACT and NT CLC peaks are included; historical or duplicate Law Firms Australia and Marninwarntikura records are consolidated; selected funding and High Court descriptions are corrected. The directory remains a researched reference, not an exhaustive census of every access-to-justice organisation, program, office or service footprint.',
  ...(raw.notes as string[]).filter(
    (note) => !STALE_NOTE_MARKERS.some((marker) => note.startsWith(marker)),
  ),
];

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

const WLSA_MEMBER_NAMES = new Set([
  "Women's Legal Centre ACT",
  "Women's Legal Service NSW",
  "Wirringa Baiya Aboriginal Women's Legal Centre",
  "Central Australian Women's Legal Service",
  "Katherine Women's Information and Legal Service",
  "Top End Women's Legal Service",
  "First Nations Women's Legal Service Queensland",
  "North Queensland Women's Legal Service",
  "Women's Legal Service Queensland",
  "Women's Legal Service SA",
  "Women's Legal Service Tasmania",
  "Women's Legal Service Victoria",
  "Women's Legal Service WA",
]);

/* The map's WLS filter follows WLSA's current 13-service directory exactly. */
export function isWomensLegalService(org: Org): boolean {
  return WLSA_MEMBER_NAMES.has(org.name);
}

export function countBy<T extends string>(rows: Array<Record<string, unknown>>, key: string) {
  const out = {} as Record<T, number>;
  for (const r of rows) {
    const k = r[key] as T;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
