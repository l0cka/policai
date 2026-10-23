import { countAiMentions, isRelevantScrapedCandidate } from '@/lib/scraper-filter';
import {
  type Jurisdiction,
  type ContentAssessment,
  type PolicyType,
} from '@/types';
import type { Candidate } from './extract';
import { CLEF_PROMPT_VERSION } from './clef-classify';

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
  /**
   * Pre-cap confidence, present only for 'ai' classifications. `relevanceScore`
   * is capped (see MACHINE_CONFIDENCE_CAP) because it is stored and shown to
   * editors, so it must always read as "needs review" per the methodology
   * page's framing of machine confidence as evidence, not a verification
   * score. But capping it would also break the review-creation gate below
   * (which needs the model's real confidence to decide whether a detection is
   * worth an editor's queue time), so the uncapped value is kept here
   * separately for that one decision and never persisted anywhere itself.
   */
  rawConfidence?: number;
}

/**
 * Ceiling for any machine-produced (non-editorial) confidence value that gets
 * stored or shown to an editor — Development.relevanceScore,
 * SourceReview.analysis.relevanceScore, and the "score N" text in
 * SourceReview.notes all flow from Classification.relevanceScore, so capping
 * it here caps all of them at the source. Kept below the review-worthy band
 * so a detection always reads as needing human judgement, never as already
 * verified.
 */
export const MACHINE_CONFIDENCE_CAP = 0.65;

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
 * auto-confidence band (MACHINE_CONFIDENCE_CAP) so detections always read as
 * "needs review".
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
    relevanceScore: strongTitle ? MACHINE_CONFIDENCE_CAP : 0.55,
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
 * Deterministic relevance for sources whose titles never carry the AI signal
 * (see WatchSource.bodyRelevance). Relevance is sustained AI discussion in the
 * fetched body; the score stays below MACHINE_CONFIDENCE_CAP's review band so
 * the detection always needs editorial judgement.
 */
export function classifyByBodyMentions(
  candidate: Candidate,
  bodyText: string,
  minAiMentions: number,
): Classification {
  const mentions = countAiMentions(bodyText);
  const isRelevant = mentions >= minAiMentions;
  return {
    isRelevant,
    relevanceScore: isRelevant ? 0.55 : 0,
    classification: 'heuristic',
    // The page excerpt is ParlInfo chrome, not speech, so the summary states
    // only the evidence the rule relied on.
    summary: isRelevant
      ? `${mentions} explicit AI mentions in the debate text for "${candidate.title}".`
      : undefined,
    tags: [],
    agencies: [],
    assessment: {
      method: 'heuristic',
      promptVersion: 'body-mentions-v1',
    },
  };
}

/**
 * Relevance for a register search row that already matched AI: the Federal
 * Register's full-text score above its cut (`@/lib/legislation/frl-search`)
 * or an AI-titled state bill (`@/lib/legislation/sa-salt`,
 * `@/lib/legislation/vic-bills`, `@/lib/legislation/state-bill-lists`).
 * None gives an excerpt, so the summary states the match; the score keeps
 * it in review.
 */
export function classifyBySearchMatch(candidate: Candidate): Classification {
  return {
    isRelevant: true,
    relevanceScore: 0.55,
    classification: 'heuristic',
    summary: candidate.text,
    tags: [],
    agencies: [],
    assessment: {
      method: 'heuristic',
      promptVersion: 'register-search-v1',
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

/**
 * Applies a model's relevance probability to a candidate. Summary, type and
 * jurisdiction still come from the keyword rules; the model only decides
 * whether the item is AI policy. `relevanceScore` (stored, shown to editors)
 * is capped at MACHINE_CONFIDENCE_CAP so it always reads as "needs review",
 * while `rawConfidence` (never persisted) keeps the real probability for the
 * review-creation gate. No score means the keyword rules decide alone.
 */
export function classificationFromScore(
  score: number | undefined,
  candidate: Candidate,
): Classification {
  const heuristic = heuristicClassification(candidate);
  if (score === undefined) return heuristic;
  return {
    ...heuristic,
    isRelevant: score >= 0.5,
    relevanceScore: Math.min(score, MACHINE_CONFIDENCE_CAP),
    rawConfidence: score,
    classification: 'ai',
    summary: heuristic.summary ?? (candidate.text || undefined),
    assessment: { method: 'ai', promptVersion: CLEF_PROMPT_VERSION },
  };
}
