import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';

export const RELEVANCE_RULESET_VERSION = 'keyword-rules-v1';

const GOVERNANCE_TITLE_KEYWORDS = [
  'policy',
  'framework',
  'guideline',
  'guidance',
  'standard',
  'regulation',
  'practice note',
  'practice direction',
  'assurance',
];

const POLICY_TYPE_RULES = [
  ['practice note', 'practice_note'],
  ['practice direction', 'practice_note'],
  ['legislation', 'legislation'],
  [' bill ', 'legislation'],
  [' act ', 'legislation'],
  ['regulation', 'regulation'],
  ['guideline', 'guideline'],
  ['guidance', 'guideline'],
  ['framework', 'framework'],
  ['standard', 'standard'],
  ['policy', 'policy'],
] as const;

const JURISDICTION_RULES = [
  ['.nsw.gov.au', 'nsw'],
  ['new south wales', 'nsw'],
  ['.vic.gov.au', 'vic'],
  ['victoria', 'vic'],
  ['.qld.gov.au', 'qld'],
  ['queensland', 'qld'],
  ['.wa.gov.au', 'wa'],
  ['western australia', 'wa'],
  ['.sa.gov.au', 'sa'],
  ['south australia', 'sa'],
  ['.tas.gov.au', 'tas'],
  ['tasmania', 'tas'],
  ['.act.gov.au', 'act'],
  ['australian capital territory', 'act'],
  ['.nt.gov.au', 'nt'],
  ['northern territory', 'nt'],
] as const;

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function summarizeText(content: string, maxLength = 600): string {
  const compact = compactText(content);
  if (compact.length <= maxLength) return compact;
  const excerpt = compact.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(
    excerpt.lastIndexOf('. '),
    excerpt.lastIndexOf('? '),
    excerpt.lastIndexOf('! '),
  );
  if (sentenceEnd >= Math.floor(maxLength * 0.6)) {
    return excerpt.slice(0, sentenceEnd + 1);
  }
  const wordEnd = excerpt.lastIndexOf(' ', maxLength);
  return `${excerpt.slice(0, wordEnd > 0 ? wordEnd : maxLength)}…`;
}

function inferPolicyType(context: string): string | null {
  const padded = ` ${context.toLowerCase()} `;
  return (
    POLICY_TYPE_RULES.find(([keyword]) => padded.includes(keyword))?.[1] ?? null
  );
}

function inferJurisdiction(context: string): string | null {
  const normalized = context.toLowerCase();
  return (
    JURISDICTION_RULES.find(([keyword]) => normalized.includes(keyword))?.[1] ??
    (normalized.includes('.gov.au') ? 'federal' : null)
  );
}

export interface ContentAnalysis {
  isRelevant: boolean;
  relevanceScore: number;
  summary: string;
  tags: string[];
  policyType?: string | null;
  jurisdiction?: string | null;
  agencies: string[];
  keyDates: string[];
  relatedTopics: string[];
}

export interface PolicySummary {
  summary: string;
  keyPoints: string[];
  implications: string[];
  affectedSectors: string[];
}

// Deterministically analyse web content for AI policy relevance. Confidence is
// deliberately capped below the automatic-promotion band so editorial review
// remains mandatory.
export async function analyseContentRelevance(
  content: string,
  sourceUrl: string,
  title = '',
): Promise<ContentAnalysis> {
  const cleanContent = compactText(content);
  const fallbackTitle = new URL(sourceUrl).pathname
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/[-_]+/g, ' ');
  const resolvedTitle = compactText(title || fallbackTitle || sourceUrl);
  const context = `${resolvedTitle} ${sourceUrl} ${cleanContent.slice(0, 8000)}`;
  const isRelevant = isRelevantScrapedCandidate({
    title: resolvedTitle,
    url: sourceUrl,
    text: cleanContent.slice(0, 8000),
  });
  const strongTitle = GOVERNANCE_TITLE_KEYWORDS.some((keyword) =>
    resolvedTitle.toLowerCase().includes(keyword),
  );
  const normalized = context.toLowerCase();
  const tags = [
    normalized.includes('generative ai') || normalized.includes('gen ai')
      ? 'generative-ai'
      : null,
    normalized.includes('automated decision') ? 'automated-decision-making' : null,
    normalized.includes('assurance') ? 'assurance' : null,
    normalized.includes('procurement') ? 'procurement' : null,
    normalized.includes('public sector') || normalized.includes('government')
      ? 'public-sector'
      : null,
  ].filter((tag): tag is string => Boolean(tag));

  return {
    isRelevant,
    relevanceScore: isRelevant ? (strongTitle ? 0.65 : 0.55) : 0,
    summary: isRelevant ? summarizeText(cleanContent) : '',
    tags,
    policyType: isRelevant ? inferPolicyType(context) : null,
    jurisdiction: isRelevant ? inferJurisdiction(context) : null,
    agencies: [],
    keyDates: [],
    relatedTopics: tags,
  };
}

// Generate a deterministic extractive summary. This remains async to preserve
// the existing call contract without introducing an external service.
export async function summarizePolicy(
  _title: string,
  content: string
): Promise<PolicySummary> {
  const sentences = compactText(content)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return {
    summary: summarizeText(content),
    keyPoints: sentences.slice(0, 4),
    implications: [],
    affectedSectors: [],
  };
}
