import type { Jurisdiction } from '@/types';

/**
 * Watch-source registry — the official pages and feeds the collector monitors.
 *
 * Sources verified 2026-07-20. `rss` sources are parsed as RSS/Atom feeds;
 * `html-index` sources are scraped for dated announcement links. Some
 * government sites reject non-browser user agents (noted per source) — the
 * collector tolerates per-source failures and reports them in meta.json.
 */

export type SourceKind = 'html-index' | 'rss' | 'document';
export type SourceCategory = 'government' | 'regulator' | 'court';
export type SourceAutomation = 'automatic' | 'manual';

export interface WatchSource {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  category: SourceCategory;
  url: string;
  kind: SourceKind;
  schedule: 'daily' | 'weekly';
  enabled: boolean;
  automation: SourceAutomation;
  critical?: boolean;
  notes?: string;
}

export const WATCH_SOURCES: WatchSource[] = [
  // --- Federal: policy owners ---
  {
    id: 'pm-media',
    name: 'Prime Minister of Australia — media',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.pm.gov.au/media',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
    critical: true,
    notes:
      'Whole-of-government announcements, including cross-portfolio AI policy decisions.',
  },
  {
    id: 'pmc-office-ai',
    name: 'Department of the Prime Minister and Cabinet — Office of AI',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.pmc.gov.au/domestic-policy/office-ai',
    kind: 'document',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    critical: true,
    notes:
      'Directly tracks the Office of AI mandate and national standards implementation; the hardened retriever currently receives no readable document text, so review manually.',
  },
  {
    id: 'industry-ai-publications',
    name: 'Department of Industry — AI publications',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.industry.gov.au/publications?pub-topic=2963',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    critical: true,
    notes:
      'AI-topic filtered publications index for formal policy, standards, frameworks and agreements; GovCMS currently times out in the hardened retriever, so review manually.',
  },
  {
    id: 'industry-ministers-media',
    name: 'Industry, Science and Resources ministers — media centre',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.minister.industry.gov.au/feed/all/all/rss.xml',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    critical: true,
    notes:
      'Official all-ministers RSS feed covering AI announcements, international agreements and infrastructure commitments; the hardened retriever currently times out, so review manually.',
  },
  {
    id: 'dta-media',
    name: 'Digital Transformation Agency — media releases',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.dta.gov.au/news-and-blogs/latest/feed/news_item',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    critical: true,
    notes:
      'Official DTA news RSS feed. GovCMS/Akamai currently stalls cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    critical: true,
    notes:
      'GovCMS/Akamai currently stalls cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes:
      'Departmental news and media-release index; GovCMS currently stalls the hardened retriever, so review manually.',
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
    automation: 'manual',
    notes:
      'GovCMS/Akamai currently stalls cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes:
      'GovCMS/Akamai currently stalls cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes:
      'GovCMS/Akamai currently stalls cloud-hosted collectors; review manually.',
  },
  {
    id: 'agd-ministers-media',
    name: "Attorney-General's portfolio ministers — media centre",
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://ministers.ag.gov.au/media-centre',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    notes:
      'Whole-of-government AI safety, privacy, copyright and automated-decision announcements; the hardened retriever currently times out, so review manually.',
  },
  {
    id: 'treasury-publications',
    name: 'Treasury — publications (digital competition, consumer law)',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://treasury.gov.au/publication',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'Digital competition and consumer-law publications remain in scope, but the current index exposes no extractable entries to the collector; review manually.',
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
    automation: 'automatic',
  },
  {
    id: 'cyber-news',
    name: 'Australian Cyber Security Centre — news',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.cyber.gov.au/about-us/view-all-content/news',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    notes:
      'ASD/ACSC news index covering AI cyber guidance and joint statements; the hardened retriever currently times out, so review manually.',
  },
  {
    id: 'apsc-latest-news',
    name: 'Australian Public Service Commission — latest news',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.apsc.gov.au/latest-news',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'manual',
    notes:
      'APS-wide AI workforce, recruitment, capability and governance guidance; the hardened retriever currently times out, so review manually.',
  },
  {
    id: 'anao-performance-audits',
    name: 'Australian National Audit Office — performance audit reports',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.anao.gov.au/pubs/performance-audit?items_per_page=120&page=0',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'Commonwealth governance audits, including agency use and oversight of AI; the hardened retriever currently times out, so review manually.',
  },
  {
    id: 'senate-ai-data-centres',
    name: 'Senate inquiry — artificial intelligence and data centres',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Environment_and_Communications/AIdatacentres48P',
    kind: 'document',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'Tracks inquiry milestones, submissions and the report due in November 2026; APH returns 403 to the hardened retriever, so review manually.',
  },
  {
    id: 'senate-new-inquiries',
    name: 'Australian Senate — new committee inquiries',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.aph.gov.au/senate/rss/new_inquiries',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
    notes:
      'Official Senate RSS feed for newly referred inquiries, including AI and data-centre scrutiny.',
  },
  {
    id: 'senate-reports',
    name: 'Australian Senate — committee reports tabled',
    jurisdiction: 'federal',
    category: 'government',
    url: 'https://www.aph.gov.au/senate/rss/reports',
    kind: 'rss',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
    notes:
      'Official Senate RSS feed for committee reports and policy recommendations.',
  },
  {
    id: 'aemc-media',
    name: 'Australian Energy Market Commission — media releases',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.aemc.gov.au/news-centre/media-releases',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'Energy-market rules and standards affecting large AI and data-centre loads; the current table markup exposes no extractable index entries, so review manually.',
  },
  // --- Federal: regulators ---
  {
    id: 'oaic-media',
    name: 'OAIC — media centre',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://www.oaic.gov.au/news/media-centre',
    kind: 'html-index',
    schedule: 'daily',
    enabled: true,
    automation: 'automatic',
    notes: 'The OAIC RSS feed omits item links, so scrape the index instead.',
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
    automation: 'automatic',
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
    automation: 'automatic',
  },
  {
    id: 'asic-newsroom',
    name: 'ASIC — newsroom',
    jurisdiction: 'federal',
    category: 'regulator',
    url: 'https://asic.gov.au/newsroom',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'The current newsroom index exposes no extractable entries to the collector; review manually.',
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
    automation: 'manual',
    notes:
      'GovCMS/Akamai currently stalls cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes:
      'The current media index exposes no extractable entries to the collector; review manually.',
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
    automation: 'manual',
    notes: 'Returns 403 to cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes: 'Returns 403 to cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes:
      'The current practice-note index exposes no extractable entries to the collector; review manually.',
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
    automation: 'automatic',
  },
  {
    id: 'qld-courts-news',
    name: 'Queensland Courts — news',
    jurisdiction: 'qld',
    category: 'court',
    url: 'https://www.courts.qld.gov.au/newsroom/news',
    kind: 'html-index',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'The current news index exposes no extractable entries to the collector; review manually.',
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
    automation: 'manual',
    notes:
      'The current AI policy page exposes no extractable entries to the collector; review manually.',
  },
  {
    id: 'vic-ai',
    name: 'vic.gov.au — generative AI guidance',
    jurisdiction: 'vic',
    category: 'government',
    url: 'https://www.vic.gov.au/administrative-guideline-safe-responsible-use-gen-ai-vps',
    kind: 'document',
    schedule: 'weekly',
    enabled: true,
    automation: 'automatic',
  },
  {
    id: 'qld-qgea-ai',
    name: 'Queensland QGEA — AI governance policy',
    jurisdiction: 'qld',
    category: 'government',
    url: 'https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/artificial-intelligence-governance-policy',
    kind: 'document',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'The site returns an AWS WAF browser challenge to cloud-hosted collectors; review manually.',
  },
  {
    id: 'wa-ai-policy',
    name: 'WA — AI policy and assurance framework',
    jurisdiction: 'wa',
    category: 'government',
    url: 'https://www.wa.gov.au/government/publications/wa-government-artificial-intelligence-policy-and-assurance-framework',
    kind: 'document',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes:
      'The direct policy document currently times out in the hardened retriever; review manually.',
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
    automation: 'manual',
    notes: 'Returns 403 to cloud-hosted collectors; review manually.',
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
    automation: 'manual',
    notes: 'Returns 403 to cloud-hosted collectors; review manually.',
  },
  {
    id: 'act-ai-policy',
    name: 'ACT Government — AI policy',
    jurisdiction: 'act',
    category: 'government',
    url: 'https://www.act.gov.au/open/act-government-artificial-intelligence-policy',
    kind: 'document',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes: 'Returns 403 to cloud-hosted collectors; review manually.',
  },
  {
    id: 'nt-ai-assurance',
    name: 'NT Digital Territory — AI assurance framework',
    jurisdiction: 'nt',
    category: 'government',
    url: 'https://digitalterritory.nt.gov.au/digital-government/strategies-and-guidance/policies-standards-and-guidance/artificial-intelligence-assurance-framework',
    kind: 'document',
    schedule: 'weekly',
    enabled: true,
    automation: 'manual',
    notes: 'Returns 403 to non-browser user agents.',
  },
];

export function getAutomaticSources(): WatchSource[] {
  return WATCH_SOURCES.filter(
    (source) => source.enabled && source.automation === 'automatic',
  );
}

/** @deprecated Prefer getAutomaticSources() so the coverage boundary is clear. */
export const getEnabledSources = getAutomaticSources;

export function getManualSources(): WatchSource[] {
  return WATCH_SOURCES.filter(
    (source) => source.enabled && source.automation === 'manual',
  );
}

export function getSourceById(id: string): WatchSource | undefined {
  return WATCH_SOURCES.find((source) => source.id === id);
}
