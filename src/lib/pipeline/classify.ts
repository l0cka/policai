import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';
import {
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
 * Deterministic keyword scoring. Confidence is deliberately capped below the
 * auto-confidence band so detections always read as "needs review".
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
 * Classify a candidate with the deterministic ruleset. The fetched page is
 * accepted for call-site compatibility; extraction already supplies the
 * bounded candidate excerpt used by the rules.
 */
export async function classifyCandidate(
  candidate: Candidate,
  pageHtml: string | null,
): Promise<Classification> {
  void pageHtml;
  return heuristicClassification(candidate);
}
