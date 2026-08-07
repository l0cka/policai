import { isRelevantScrapedCandidate } from '@/lib/scraper-filter';
import {
  normalizeJurisdiction,
  normalizePolicyType,
  type Jurisdiction,
  type ContentAssessment,
  type PolicyType,
} from '@/types';
import type { Candidate } from './extract';
import {
  classifyBatch,
  type ClaudeCandidate,
  type ClaudeVerdict,
} from './claude-classify';

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
   * (which needs Claude's real confidence to decide whether a detection is
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
 * Reads the collector's Claude-classifier opt-in. Unset (the default) keeps
 * the deterministic heuristic path byte-for-byte unchanged; the Argus timer
 * sets this once the Claude path is trusted enough to run unattended.
 */
export function isClaudeClassifierEnabled(): boolean {
  return Boolean(process.env.USE_CLAUDE_CLASSIFIER);
}

/**
 * Scores a whole batch of candidates with Claude in a single `classifyBatch`
 * call (which itself chunks at CLAUDE_BATCH_SIZE). Batching — rather than one
 * call per candidate — is the entire reason Task 3's classifier is cheap
 * (~$13/month vs. ~$375/month); calling it in a per-candidate loop would
 * silently reintroduce that cost. Excerpts come from the cheap pre-fetch
 * extraction text so this can run once per source ahead of the collector's
 * per-candidate document-fetch loop, rather than needing the deep fetch to
 * complete first.
 *
 * A ClaudeAuthError (or any other error) from `classifyBatch` propagates to
 * the caller unchanged — an expired credential is an operational failure
 * distinct from a source outage, and must fail the run rather than being
 * absorbed into a per-candidate fallback.
 */
export async function classifyCandidatesWithClaude(
  candidates: { id: string; title: string; text: string }[],
  sourceName: string,
): Promise<Map<string, ClaudeVerdict>> {
  const claudeCandidates: ClaudeCandidate[] = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    sourceName,
    excerpt: candidate.text,
  }));
  const verdicts = await classifyBatch(claudeCandidates);
  return new Map(verdicts.map((verdict) => [verdict.id, verdict]));
}

/**
 * Maps a Claude verdict onto the same Classification shape the deterministic
 * path produces. `confidence` does two jobs that pull in opposite directions,
 * so it is split into two fields:
 *  - `relevanceScore` (persisted, editor-facing) is capped at
 *    MACHINE_CONFIDENCE_CAP — the same cap the heuristic path uses — so a
 *    Claude verdict of e.g. 0.99 never shows up as near-certain in stored
 *    data; it reads exactly as "needs review" as any other machine detection
 *    does.
 *  - `rawConfidence` (in-memory only, never persisted) keeps Claude's actual
 *    confidence so the collector's review-creation gate can still tell a
 *    genuinely confident detection from a marginal one — capping the value
 *    used for that decision would make the gate impossible to clear for any
 *    high-confidence Claude verdict, defeating the point of running Claude
 *    classification at all.
 *
 * A missing verdict (Claude dropped the item, e.g. it failed schema
 * validation) falls back to the deterministic heuristic rather than
 * discarding the candidate — consistent with claude-classify.ts's own
 * convention that a malformed entry is a skipped item, never lost data.
 */
export function classificationFromVerdict(
  verdict: ClaudeVerdict | undefined,
  candidate: Candidate,
): Classification {
  if (!verdict) return heuristicClassification(candidate);
  return {
    isRelevant: verdict.relevant,
    relevanceScore: Math.min(verdict.confidence, MACHINE_CONFIDENCE_CAP),
    rawConfidence: verdict.confidence,
    classification: 'ai',
    summary: verdict.summary,
    suggestedType: verdict.type ? normalizePolicyType(verdict.type) : undefined,
    suggestedJurisdiction: verdict.jurisdiction
      ? normalizeJurisdiction(verdict.jurisdiction)
      : undefined,
    tags: [],
    agencies: [],
    assessment: {
      method: 'ai',
      promptVersion: 'claude-classify-v1',
    },
  };
}
