export type RelationshipType =
  | 'funding'
  | 'referral'
  | 'secondment'
  | 'clinic'
  | 'project_support';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  funding: 'Funding',
  referral: 'Referral',
  secondment: 'Secondment',
  clinic: 'Clinic',
  project_support: 'Project support',
};

export type RelationshipEvidence = {
  organisations: string[];
  type: RelationshipType;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
  evidenceDate: string;
  checkedAt: string;
  status: 'current-description' | 'documented-example';
};

/**
 * Named relationships are intentionally sparse. A link belongs here only when
 * a first-party page or the Australian Pro Bono Centre documents it. Historical
 * examples remain labelled as examples; they are not presented as current.
 */
export const RELATIONSHIP_EVIDENCE: RelationshipEvidence[] = [
  {
    organisations: ['Justice Connect'],
    type: 'referral',
    summary:
      'Justice Connect describes a network of more than 10,000 pro bono lawyers and established referral programs for people and community organisations.',
    sourceLabel: 'Justice Connect — Our pro bono members',
    sourceUrl: 'https://justiceconnect.org.au/pro-bono-members/',
    evidenceDate: 'current page',
    checkedAt: '2026-08-12',
    status: 'current-description',
  },
  {
    organisations: ['Justice Connect'],
    type: 'clinic',
    summary:
      'Justice Connect says its member firms can participate in generalist legal clinics and specialist pro bono programs.',
    sourceLabel: 'Justice Connect — Our pro bono members',
    sourceUrl: 'https://justiceconnect.org.au/pro-bono-members/',
    evidenceDate: 'current page',
    checkedAt: '2026-08-12',
    status: 'current-description',
  },
  {
    organisations: ['LawRight'],
    type: 'referral',
    summary:
      'LawRight says Pro Bono Connect assesses applications and connects eligible Queensland clients and not-for-profits with the legal profession.',
    sourceLabel: 'LawRight — Pro Bono Connect',
    sourceUrl: 'https://lawright.org.au/find-legal-help/pro-bono-connect/',
    evidenceDate: 'current page',
    checkedAt: '2026-08-12',
    status: 'current-description',
  },
  {
    organisations: ['JusticeNet SA'],
    type: 'referral',
    summary:
      'JusticeNet SA describes Pro Bono Connect as its referral service linking eligible people and charitable organisations with lawyers.',
    sourceLabel: 'JusticeNet SA — Who we are',
    sourceUrl: 'https://justicenet.org.au/who-we-are',
    evidenceDate: 'current page',
    checkedAt: '2026-08-12',
    status: 'current-description',
  },
  {
    organisations: ['Inner Melbourne Community Legal'],
    type: 'secondment',
    summary:
      'IMCL documents full-time secondment placements as one way its named pro bono partners have supported the centre.',
    sourceLabel: "Inner Melbourne Community Legal — Pro bono partners' stories",
    sourceUrl: 'https://imcl.org.au/about-us/our-40-years/40-stories/our-pro-bono-partners-stories/',
    evidenceDate: 'published 2018',
    checkedAt: '2026-08-12',
    status: 'documented-example',
  },
  {
    organisations: ['WEstjustice'],
    type: 'project_support',
    summary:
      'WEstjustice identifies pro bono assistance as crucial to its services and separately names private-firm support for specific community projects.',
    sourceLabel: 'WEstjustice — About us',
    sourceUrl: 'https://www.westjustice.org.au/about-us',
    evidenceDate: 'current page',
    checkedAt: '2026-08-12',
    status: 'current-description',
  },
  {
    organisations: ['Kingsford Legal Centre'],
    type: 'secondment',
    summary:
      'The Australian Pro Bono Centre documents the long-running KLC and Herbert Smith Freehills secondment as a partnership example.',
    sourceLabel: 'Australian Pro Bono Centre — Secondments',
    sourceUrl: 'https://www.probonocentre.org.au/whatworks/part-4/chap-22/',
    evidenceDate: 'documented case study',
    checkedAt: '2026-08-12',
    status: 'documented-example',
  },
];

export const SYSTEM_EVIDENCE = {
  najp: {
    label: 'Attorney-General’s Department — NAJP 2025–30',
    url: 'https://www.ag.gov.au/legal-system/legal-assistance-services/national-access-justice-partnership-2025-30',
  },
  clcNetwork: {
    label: 'Community Legal Centres Australia — About us',
    url: 'https://clcs.org.au/about-us/',
  },
  proBonoModels: {
    label: 'Australian Pro Bono Centre — Models of pro bono legal assistance',
    url: 'https://www.probonocentre.org.au/whatworks/part-4/',
  },
} as const;
