/**
 * Single source of truth for Australian government AI policy data sources.
 * Used by the scraper, research agent, and admin dashboard.
 */

export interface DataSource {
  id: string;
  name: string;
  url: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'source-1',
    name: 'DTA AI Policy',
    url: 'https://www.dta.gov.au/our-projects/artificial-intelligence',
    schedule: 'daily',
    enabled: true,
  },
  {
    id: 'source-2',
    name: 'DISER AI Strategy',
    url: 'https://www.industry.gov.au/science-technology-and-innovation/technology/artificial-intelligence',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-3',
    name: 'CSIRO Data61',
    url: 'https://www.csiro.au/en/research/technology-space/ai',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-4',
    name: 'AHRC AI Ethics',
    url: 'https://humanrights.gov.au/our-work/technology-and-human-rights',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-5',
    name: 'OAIC AI Guidance',
    url: 'https://www.oaic.gov.au/privacy/guidance-and-advice/artificial-intelligence-and-privacy',
    schedule: 'monthly',
    enabled: true,
  },
  {
    id: 'source-6',
    name: 'NSW Digital AI',
    url: 'https://www.digital.nsw.gov.au/policy/artificial-intelligence',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-7',
    name: 'Victorian AI Strategy',
    url: 'https://www.vic.gov.au/artificial-intelligence-strategy',
    schedule: 'weekly',
    enabled: true,
  },
  {
    id: 'source-8',
    name: 'ACCC Digital Platforms',
    url: 'https://www.accc.gov.au/focus-areas/digital-platforms-and-services',
    schedule: 'monthly',
    enabled: true,
  },
];

/** Lookup a source by its ID. */
export function getSourceById(id: string): DataSource | undefined {
  return DATA_SOURCES.find((s) => s.id === id);
}

/** Map of source IDs to { name, url } for quick lookup by scraper routes. */
export const DATA_SOURCES_MAP: Record<string, { name: string; url: string }> = Object.fromEntries(
  DATA_SOURCES.map((s) => [s.id, { name: s.name, url: s.url }]),
);
