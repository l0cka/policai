import type { ContentAnalysis } from '@/lib/analysis';

interface ScrapedLinkLike {
  url: string;
  title: string;
  text: string;
}

const AI_KEYWORDS = [
  'artificial intelligence',
  'generative ai',
  'gen ai',
  'machine learning',
  'automated decision',
  'algorithmic',
  'data centre',
  'data center',
  'hyperscale',
  'large-scale compute',
  'compute infrastructure',
  'ai ',
  ' ai',
];

const GOVERNANCE_KEYWORDS = [
  'policy',
  'guidance',
  'guideline',
  'framework',
  'standard',
  'regulation',
  'governance',
  'ethic',
  'safety',
  'assurance',
  'assessment',
  'adoption',
  'principle',
  'plan',
  'roadmap',
  'statement',
  'expectation',
  'priority',
  'inquiry',
  'draft rule',
  'memorandum',
  'agreement',
  'announcement',
  'media release',
  'consultation',
  'audit',
  'procurement',
  'transparency',
];

const GENERIC_TITLE_PATTERNS = [
  /^privacy policy$/i,
  /^privacy$/i,
  /^policy\s*(?:&|and)\s*guidelines?$/i,
  /^commitments$/i,
  /^mission\s+\d+[a-z]?\b/i,
  /^terms(?: of use)?$/i,
  /^accessibility$/i,
  /^contact(?: us)?$/i,
  /^cookies?$/i,
  /^copyright$/i,
  /^sitemap$/i,
];

const GENERIC_URL_PATTERNS = [
  /\/privacy(?:-policy)?(?:\/|$)/i,
  /\/cookies?(?:\/|$)/i,
  /\/accessibility(?:\/|$)/i,
  /\/terms(?:-of-use)?(?:\/|$)/i,
  /\/contact(?:\/|$)/i,
  /\/about\/policies?(?:\/|$)/i,
  /\/policies\/privacy(?:\/|$)/i,
];

const HUB_TITLE_PATTERNS = [
  /^learn about\b/i,
  /^identifying\b/i,
  /\band tools\b/i,
  /\band frameworks?\b/i,
  /\bresponsibilit(?:y|ies)\b/i,
];

const SUBSECTION_URL_PATTERNS = [
  /\/node\/\d+(?:\/|$)/i,
  /\/responsibilities(?:\/|$)/i,
  /\/identifying-ai(?:\/|$)/i,
  /\/ai-guidance-and-tools(?:\/|$)/i,
  /\/ai-governance-assurance-and-frameworks(?:\/|$)/i,
];

export function cleanScrapedLinkTitle(title: string): string {
  return title
    .replace(/(?:\s+|_)?(?:north_?east|north_?west|south_?east|south_?west|east|west|north|south)$/i, '')
    .replace(/\(opens? in (?:a )?new (?:window|tab)\)/gi, '')
    .replace(/\b(?:PDF|DOCX?|XLSX?|PPTX?)\s*,?\s*\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function hasAiSignalInTitleOrUrl(title: string, url: string): boolean {
  return hasAnyKeyword(normalize(`${title} ${url}`), AI_KEYWORDS);
}

function hasGovernanceSignal(text: string): boolean {
  return hasAnyKeyword(normalize(text), GOVERNANCE_KEYWORDS);
}

function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return /\.pdf(?:[?#].*)?$/i.test(url);
  }
}

function isGenericPage(title: string, url: string): boolean {
  return (
    GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(title.trim())) ||
    GENERIC_URL_PATTERNS.some((pattern) => pattern.test(url))
  );
}

function isStrongDocumentCandidate(link: ScrapedLinkLike): boolean {
  const normalizedTitle = normalize(link.title);

  if (HUB_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle))) {
    return false;
  }

  if (SUBSECTION_URL_PATTERNS.some((pattern) => pattern.test(link.url))) {
    return false;
  }

  return hasGovernanceSignal(`${link.title} ${link.url}`);
}

export function isRelevantScrapedCandidate(link: ScrapedLinkLike): boolean {
  const context = `${link.title} ${link.url} ${link.text}`;
  const titleOrUrlHasAiSignal = hasAiSignalInTitleOrUrl(link.title, link.url);

  if (isGenericPage(link.title, link.url) && !titleOrUrlHasAiSignal) {
    return false;
  }

  if (!titleOrUrlHasAiSignal) {
    return false;
  }

  return hasGovernanceSignal(context) || isPdfUrl(link.url);
}

export function shouldCreatePolicyFromAnalysis(
  link: ScrapedLinkLike,
  analysis: ContentAnalysis,
): boolean {
  if (!analysis.isRelevant || analysis.relevanceScore < 0.8 || !isStrongDocumentCandidate(link)) {
    return false;
  }

  const analysisContext = normalize(
    `${analysis.summary} ${analysis.tags.join(' ')} ${analysis.relatedTopics.join(' ')}`,
  );

  return hasAiSignalInTitleOrUrl(link.title, link.url) || hasAnyKeyword(analysisContext, AI_KEYWORDS);
}

export function shouldQueuePolicyForReview(
  link: ScrapedLinkLike,
  analysis: ContentAnalysis,
): boolean {
  if (!analysis.isRelevant || analysis.relevanceScore < 0.5) {
    return false;
  }

  const analysisContext = normalize(
    `${analysis.summary} ${analysis.tags.join(' ')} ${analysis.relatedTopics.join(' ')}`,
  );

  return hasAiSignalInTitleOrUrl(link.title, link.url) || hasAnyKeyword(analysisContext, AI_KEYWORDS);
}
