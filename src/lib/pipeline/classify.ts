import {
  getAiModel,
  getAiProvider,
  hasAiProvider,
} from '@/lib/ai-client';
import {
  analyseContentRelevance,
  RELEVANCE_PROMPT_VERSION,
} from '@/lib/analysis';
import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';
import { cleanHtmlContent } from '@/lib/utils';
import {
  isJurisdiction,
  isPolicyType,
  type Jurisdiction,
  type ContentAssessment,
  type PolicyType,
} from '@/types';
import type { Candidate } from './extract';

export interface Classification {
  isRelevant: boolean;
  relevanceScore: number;
  classification: 'ai' | 'heuristic';
  summary?: string;
  suggestedType?: PolicyType;
  suggestedJurisdiction?: Jurisdiction;
  tags: string[];
  agencies: string[];
  assessment: Omit<ContentAssessment, 'assessedAt'>;
}

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

/**
 * Keyword-only scoring for when no AI provider is configured (or AI fails).
 * Confidence is deliberately capped below the auto-confidence band so
 * heuristic detections always read as "needs review".
 */
export function heuristicClassification(candidate: Candidate): Classification {
  if (!isRelevantScrapedCandidate(candidate)) {
    return {
      isRelevant: false,
      relevanceScore: 0,
      classification: 'heuristic',
      tags: [],
      agencies: [],
      assessment: {
        method: 'heuristic',
        promptVersion: 'keyword-rules-v1',
      },
    };
  }

  const title = candidate.title.toLowerCase();
  const strongTitle = GOVERNANCE_TITLE_KEYWORDS.some((keyword) =>
    title.includes(keyword),
  );

  return {
    isRelevant: true,
    relevanceScore: strongTitle ? 0.65 : 0.55,
    classification: 'heuristic',
    summary: candidate.text || undefined,
    tags: [],
    agencies: [],
    assessment: {
      method: 'heuristic',
      promptVersion: 'keyword-rules-v1',
    },
  };
}

/**
 * Classify a candidate, preferring AI analysis of the fetched page content
 * and degrading to heuristics when no provider is configured or the AI call
 * fails.
 */
export async function classifyCandidate(
  candidate: Candidate,
  pageHtml: string | null,
): Promise<Classification> {
  if (!hasAiProvider() || !pageHtml) {
    return heuristicClassification(candidate);
  }

  try {
    const content = cleanHtmlContent(pageHtml);
    const analysis = await analyseContentRelevance(content, candidate.url);
    const provider = getAiProvider();
    return {
      isRelevant: analysis.isRelevant,
      relevanceScore: analysis.relevanceScore,
      classification: 'ai',
      summary: analysis.summary || candidate.text || undefined,
      suggestedType: isPolicyType(analysis.policyType)
        ? analysis.policyType
        : undefined,
      suggestedJurisdiction: isJurisdiction(analysis.jurisdiction)
        ? analysis.jurisdiction
        : undefined,
      tags: analysis.tags || [],
      agencies: analysis.agencies || [],
      assessment: {
        method: 'ai',
        promptVersion: RELEVANCE_PROMPT_VERSION,
        provider: provider ?? undefined,
        model: getAiModel(),
      },
    };
  } catch (error) {
    console.warn(
      `[classify] AI analysis failed for ${candidate.url}; using heuristics:`,
      error instanceof Error ? error.message : error,
    );
    return heuristicClassification(candidate);
  }
}
