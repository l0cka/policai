import type { Jurisdiction } from '@/types';

/**
 * Watch-source registry — the official pages and feeds the collector monitors.
 *
 * Sources verified 2026-07-10. `rss` sources are parsed as RSS/Atom feeds;
 * `html-index` sources are scraped for dated announcement links. Some
 * government sites reject non-browser user agents (noted per source) — the
 * collector tolerates per-source failures and reports them in meta.json.
 */

export type SourceKind = 'html-index' | 'rss';
export type SourceCategory = 'government' | 'regulator' | 'court';

export interface WatchSource {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  category: SourceCategory;
  url: string;
  kind: SourceKind;
  schedule: 'daily' | 'weekly';
  enabled: boolean;
  notes?: string;
}

export const WATCH_SOURCES: WatchSource[] = [
  // --- Federal: policy owners ---
  {
    id: 'dta-media',
    name: 'Digital Transformation Agency — media releases',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.dta.gov.au/media-releases',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'digital-gov-ai',
    name: 'digital.gov.au — AI in government policy hub',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.digital.gov.au/policy/ai',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'disr-news',
    name: 'Department of Industry, Science and Resources — news',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.industry.gov.au/news',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    notes: 'May reject non-browser user agents.',
  },
  {
    id: 'naic-news',
    name: 'National AI Centre — news and insights',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.ai.gov.au/news-and-insights',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'finance-news',
    name: 'Department of Finance — news (APS AI Plan, GovAI)',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.finance.gov.au/about-us/news',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'agd-news',
    name: "Attorney-General's Department — news (copyright & AI)",
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.ag.gov.au/about-us/news-and-media',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'treasury-news',
    name: 'Treasury — newsroom (digital competition, consumer law)',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://treasury.gov.au/newsroom',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'csiro-news',
    name: 'CSIRO — news (Data61, AI research)',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.csiro.au/en/news',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  // --- Federal: regulators ---
  {
    id: 'oaic-rss',
    name: 'OAIC — media releases',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.oaic.gov.au/rss',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'accc-rss',
    name: 'ACCC — media releases',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.accc.gov.au/rss/media_releases.xml',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'apra-rss',
    name: 'APRA — news',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.apra.gov.au/rss.xml',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'asic-newsroom',
    name: 'ASIC — newsroom',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://asic.gov.au/newsroom/',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'esafety-media',
    name: 'eSafety Commissioner — media releases',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.esafety.gov.au/newsroom/media-releases',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'pc-media',
    name: 'Productivity Commission — media and speeches',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.pc.gov.au/media-speeches',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'ahrc-media',
    name: 'Australian Human Rights Commission — media centre',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://humanrights.gov.au/about-us/media-centre',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    notes: 'Returns 403 to non-browser user agents.',
  },
  // --- Courts ---
  {
    id: 'fedcourt-practice-notes',
    name: 'Federal Court — practice notes',
    jurisdiction: 'federal',
    category: 'court',
    url: 'https://www.fedcourt.gov.au/law-and-practice/practice-documents/practice-notes',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'nsw-sc-practice-notes',
    name: 'NSW Supreme Court — practice notes',
    jurisdiction: 'nsw',
    category: 'court',
    url: 'https://supremecourt.nsw.gov.au/practice-procedure/practice-notes0.html',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'vic-sc-practice-notes',
    name: 'Victorian Supreme Court — practice notes',
    jurisdiction: 'vic',
    category: 'court',
    url: 'https://www.supremecourt.vic.gov.au/areas/legal-resources/practice-notes',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'qld-courts-news',
    name: 'Queensland Courts — news',
    jurisdiction: 'qld',
    category: 'court',
    url: 'https://www.courts.qld.gov.au/about/news',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  // --- States and territories ---
  {
    id: 'nsw-digital-ai',
    name: 'Digital NSW — artificial intelligence',
    jurisdiction: 'nsw',
    category: 'government',
    url: 'https://www.digital.nsw.gov.au/policy/artificial-intelligence',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'vic-ai',
    name: 'vic.gov.au — generative AI guidance',
    jurisdiction: 'vic',
    category: 'government',
    url: 'https://www.vic.gov.au/administrative-guideline-safe-responsible-use-gen-ai-vps',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'qld-qgea-ai',
    name: 'Queensland QGEA — AI governance policy',
    jurisdiction: 'qld',
    category: 'government',
    url: 'https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/artificial-intelligence-governance-policy',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'wa-ai-policy',
    name: 'WA — AI policy and assurance framework',
    jurisdiction: 'wa',
    category: 'government',
    url: 'https://www.wa.gov.au/government/publications/wa-government-artificial-intelligence-policy-and-assurance-framework',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'sa-office-for-ai',
    name: 'SA Office for AI',
    jurisdiction: 'sa',
    category: 'government',
    url: 'https://www.ai.sa.gov.au/',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'tas-dpac-policies',
    name: 'Tasmania DPAC — digital strategy policies',
    jurisdiction: 'tas',
    category: 'government',
    url: 'https://www.dpac.tas.gov.au/divisions/digital_strategy_and_services/policies',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'act-ai-policy',
    name: 'ACT Government — AI policy',
    jurisdiction: 'act',
    category: 'government',
    url: 'https://www.act.gov.au/open/act-government-artificial-intelligence-policy',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'nt-ai-assurance',
    name: 'NT Digital Territory — AI assurance framework',
    jurisdiction: 'nt',
    category: 'government',
    url: 'https://digitalterritory.nt.gov.au/digital-government/strategies-and-guidance/policies-standards-and-guidance/artificial-intelligence-assurance-framework',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    notes: 'Returns 403 to non-browser user agents.',
  },
];

export function getEnabledSources(): WatchSource[] {
  return WATCH_SOURCES.filter((source) => source.enabled);
}

export function getSourceById(id: string): WatchSource | undefined {
  return WATCH_SOURCES.find((source) => source.id === id);
}
