export type RelationshipType =
  | 'funding'
  | 'referral'
  | 'secondment'
  | 'clinic';

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  funding: 'Funding',
  referral: 'Referral',
  secondment: 'Secondment',
  clinic: 'Clinic',
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
  najpOverview: {
    label: 'AGD NAJP overview',
    url: 'https://www.ag.gov.au/legal-system/legal-assistance-services/national-access-justice-partnership-2025-30',
  },
  najpAgreement: {
    label: 'Signed NAJP agreement',
    url: 'https://federalfinancialrelations.gov.au/sites/federalfinancialrelations.gov.au/files/2024-12/agreement-national-access-to-justice-partnership-signed.pdf',
  },
  clsp: {
    label: 'Community Legal Services Program grants',
    url: 'https://ministers.ag.gov.au/media-centre/community-legal-service-grants-improve-access-justice-30-06-2025',
  },
  legalAidNetwork: {
    label: 'National Legal Aid',
    url: 'https://nationallegalaid.org.au/about-us',
  },
  clcNetwork: {
    label: 'CLCs Australia network',
    url: 'https://clcs.org.au/about-us/community-legal-centres/',
  },
  wlsNetwork: {
    label: 'WLSA service directory',
    url: 'https://wlsa.org.au/members/',
  },
  atsilsNetwork: {
    label: 'NATSILS members',
    url: 'https://www.natsils.org.au/',
  },
  fvplsNetwork: {
    label: 'FNAAFV service directory',
    url: 'https://fnaafv.org.au/fvpls-services/',
  },
  privateProfession: {
    label: 'National Legal Aid private-practitioner census',
    url: 'https://nationallegalaid.org.au/policy-and-advocacy/reports/nla-private-practitioner-census-2024-report',
  },
  proBonoTarget: {
    label: 'National Pro Bono Target',
    url: 'https://www.probonocentre.org.au/provide-pro-bono/target/',
  },
  proBonoModels: {
    label: 'Models of pro bono work',
    url: 'https://www.probonocentre.org.au/aus-pro-bono-manual/part-1/chap-1-7/',
  },
  proBonoLimits: {
    label: 'Role and limits of pro bono',
    url: 'https://www.probonocentre.org.au/final-report-pro-bono/',
  },
  proBonoReferrals: {
    label: 'Pro bono referral schemes',
    url: 'https://www.probonocentre.org.au/aus-pro-bono-manual/part-3/chap-3-3/',
  },
  highCourtProtocol: {
    label: 'High Court pro bono protocol',
    url: 'https://www.hcourt.gov.au/assets/registry/High_Court_of_Australia_Pro_Bono_Protocol_20_December_2024.pdf',
  },
} as const;
