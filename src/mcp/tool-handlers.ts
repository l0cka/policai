import {
	analyseSourceUrl,
	auditMcpTool,
  type BrowserCaptureInput,
  type ManualExtractionInput,
  type ReviewedDateInput,
  checkCoverage,
  decideSourceReview,
  describeSourceProposal,
  normalizeReviewStatus,
  proposeSourceDecision,
  recordManualSourceReview,
  rejectStagedSource,
  stageSourceCapture,
  stageSourceUrl,
  verifyRegisterRecord,
} from '@/lib/source-ingest';
import path from 'node:path';
import { getSourceReviews } from '@/lib/data-service';
import { readJsonFile, writeJsonFile } from '@/lib/file-store';
import { withDataMutationLock } from '@/lib/data-lock';
import {
  batchCovers,
  planSourceReviewBatches,
  sourceReviewBatchSubject,
  type SourceReviewBatchLedger,
  type SourceReviewBatchRef,
} from '@/lib/source-review-batch';
import {
  approvalPageUrl,
  approvalSubject,
  fetchEditorApproval,
  readEditorPasskeys,
  verifyEditorApproval,
} from '@/lib/editor-approval';
import {
  isSignalReviewer,
  signalReviewers,
} from '@/lib/signal-source-reviews';
import {
  MAX_THEMES_PER_RECORD,
  MIN_RECORDS_PER_THEME,
  MIN_THEMES_PER_RECORD,
  THEMES,
} from '@/lib/themes';
import {
  getCourtRequirementsForReview,
  reviewCourtRequirement,
  type CourtRequirementReviewDecision,
  type CourtRequirementRevision,
} from '@/lib/court-requirements';
import type {
  CourtRequirementStatus,
  PolicyDraft,
  SourceEvidence,
  SourceReviewEntryKind,
  TimelineEventDraft,
} from '@/types';

const MCP_ACTOR = 'local-mcp-admin';

export function toToolText(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function audited<T>(
  toolName: string,
  input: { sourceUrl?: string },
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    await auditMcpTool({
      actor: MCP_ACTOR,
      toolName,
      sourceUrl: input.sourceUrl,
      status: 'success',
    });
    return result;
  } catch (error) {
    await auditMcpTool({
      actor: MCP_ACTOR,
      toolName,
      sourceUrl: input.sourceUrl,
      status: 'error',
      errorSummary: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error',
    });
    throw error;
  }
}

export async function handleCheckCoverage(input: { query?: string; sourceUrl?: string }) {
  if (!input.query && !input.sourceUrl) {
    throw new Error('Either query or sourceUrl is required');
  }
  return checkCoverage(input);
}

export async function handleAnalyseSourceUrl(input: { url: string; stageOnly?: boolean }) {
  const result = await analyseSourceUrl(input.url, { stageOnly: input.stageOnly });
  return {
    url: result.url,
    title: result.title,
    analysis: result.analysis,
    discoveredAt: result.discoveredAt,
  };
}

export async function handleStageSourceUrl(input: {
  url: string;
  entryKind: SourceReviewEntryKind;
  targetRecordId?: string;
  proposedRecord?: Record<string, unknown>;
  notes?: string;
  stageOnly?: boolean;
}) {
  return audited('stage_source_url', { sourceUrl: input.url }, () => {
    return stageSourceUrl({
      url: input.url,
      entryKind: input.entryKind,
      targetRecordId: input.targetRecordId,
      proposedRecord: input.proposedRecord as
        | PolicyDraft
        | TimelineEventDraft
        | undefined,
      notes: input.notes,
      actor: MCP_ACTOR,
      stageOnly: input.stageOnly,
    });
  });
}

export async function handleStageSourceCapture(input: {
  url: string;
  entryKind: SourceReviewEntryKind;
  targetRecordId?: string;
  proposedRecord?: Record<string, unknown>;
  replaceTargetSource?: boolean;
  notes?: string;
  capture: BrowserCaptureInput;
}) {
  return audited('stage_source_capture', { sourceUrl: input.url }, () => {
    return stageSourceCapture({
      url: input.url,
      entryKind: input.entryKind,
      targetRecordId: input.targetRecordId,
      proposedRecord: input.proposedRecord as
        | PolicyDraft
        | TimelineEventDraft
        | undefined,
      replaceTargetSource: input.replaceTargetSource,
      notes: input.notes,
      actor: MCP_ACTOR,
      browserCapture: input.capture,
    });
  });
}

export async function handleListStagedSources(input: { status?: string }) {
  const status = normalizeReviewStatus(input.status);
  return getSourceReviews(status ? { status } : undefined);
}

export function handleListThemes(
  table: readonly { key: string; label: string }[] = THEMES,
) {
  return {
    themes: table.map(({ key, label }) => ({ key, label })),
    minThemesPerRecord: MIN_THEMES_PER_RECORD,
    maxThemesPerRecord: MAX_THEMES_PER_RECORD,
    minRecordsPerTheme: MIN_RECORDS_PER_THEME,
  };
}

export async function handleListCourtRequirementCandidates(input: {
  status?: CourtRequirementStatus;
  policyId?: string;
}) {
  return getCourtRequirementsForReview(input);
}

export async function handleReviewCourtRequirement(input: {
  id: string;
  decision: CourtRequirementReviewDecision;
  reviewer?: string;
  notes?: string;
  revision?: CourtRequirementRevision;
}) {
  return audited('review_court_requirement', {}, () => {
    const reviewer = input.reviewer?.trim();
    if (!reviewer) throw new Error('A human reviewer identity is required');
    const notes = input.notes?.trim();
    if (!notes) throw new Error('Review notes are required');
    return reviewCourtRequirement({
      id: input.id,
      decision: input.decision,
      reviewer,
      notes,
      revision: input.revision,
    });
  });
}

export async function handleShowSourceProposal(input: { id: string }) {
  const proposal = await describeSourceProposal(input.id);
  return {
    ...proposal,
    approvalUrl: approvalPageUrl(
      approvalSubject({ kind: 'source-review', id: input.id, proposalHash: proposal.proposalHash }),
    ),
  };
}

export async function handleProposeSourceDecision(input: {
  id: string;
  proposedBy?: string;
  proposedRecord?: Record<string, unknown>;
  expectedTargetRevisionHash?: string;
  officialSourceUrl?: string;
  manualExtraction?: ManualExtractionInput;
  reviewedDate?: ReviewedDateInput;
  notes?: string;
}) {
  return audited('propose_source_decision', {}, () => {
    return proposeSourceDecision({
      id: input.id,
      proposedBy: input.proposedBy?.trim() ?? '',
      proposedRecord: input.proposedRecord as
        | PolicyDraft
        | TimelineEventDraft
        | undefined,
      expectedTargetRevisionHash: input.expectedTargetRevisionHash,
      officialSourceUrl: input.officialSourceUrl,
      manualExtraction: input.manualExtraction,
      reviewedDate: input.reviewedDate,
      notes: input.notes,
    });
  });
}

const DECISION_CARD_URL = /^https:\/\/claude\.ai\/\S+$/;
const SOURCE_REVIEW_BATCHES_FILE = path.join(process.cwd(), 'data', 'source-review-batches.json');

const readSourceReviewBatches = () =>
  readJsonFile<SourceReviewBatchLedger>(SOURCE_REVIEW_BATCHES_FILE, { batches: [] });

/**
 * Puts several approvable proposals to the editor for one passkey signature.
 * Every proposal must have no blockers; the batch pins each review to its
 * current proposalHash. Returns each batch's approvalUrl and what the editor
 * must see for every entry.
 */
export async function handleProposeSourceReviewBatch(input: { ids: string[]; batchSize?: number }) {
  return audited('propose_source_review_batch', {}, () =>
    withDataMutationLock(async () => {
      const ids = [...new Set(input.ids)];
      if (ids.length === 0) throw new Error('Name at least one staged review');
      const proposals = await Promise.all(ids.map((id) => describeSourceProposal(id)));
      const problems = proposals.flatMap((proposal) =>
        proposal.blockers.map((blocker) => `${proposal.id}: ${blocker}`),
      );
      if (problems.length > 0) {
        throw new Error(`These proposals cannot go to the editor yet:\n- ${problems.join('\n- ')}`);
      }
      const ledger = await readSourceReviewBatches();
      const batches = planSourceReviewBatches(
        proposals.map((proposal) => ({ id: proposal.id, proposalHash: proposal.proposalHash })),
        ledger,
        { now: new Date(), batchSize: input.batchSize },
      );
      await writeJsonFile(SOURCE_REVIEW_BATCHES_FILE, { batches: [...ledger.batches, ...batches] });
      const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
      return batches.map((batch) => ({
        id: batch.id,
        approvalUrl: approvalPageUrl(sourceReviewBatchSubject(batch)),
        proposals: batch.entries.map((entry) => byId.get(entry.id)!),
      }));
    }),
  );
}

async function batchForDecision(batchId: string, entry: { id: string; proposalHash: string }): Promise<SourceReviewBatchRef> {
  const batch = (await readSourceReviewBatches()).batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new Error(`Unknown source review batch ${batchId}`);
  if (!batchCovers(batch, entry)) {
    throw new Error(`Batch ${batchId} does not include proposal ${entry.proposalHash.slice(0, 8)} of ${entry.id}`);
  }
  return { id: batch.id, entries: batch.entries };
}

/**
 * Records the editor's decision. Once an editor passkey is registered, the
 * only accepted decision is that editor's passkey signature over this exact
 * proposal, or over a batch that pins it (batchId), read from the approvals
 * mailbox; the reviewer is whoever the signing key belongs to. Before then,
 * the card link stands in.
 */
export async function handleRecordDecision(input: {
  id: string;
  proposalHash: string;
  batchId?: string;
  reviewer?: string;
  attestationUrl?: string;
}) {
  return audited('record_decision', {}, async () => {
    const passkeys = await readEditorPasskeys();
    if (passkeys.length > 0) {
      const batch = input.batchId
        ? await batchForDecision(input.batchId, { id: input.id, proposalHash: input.proposalHash })
        : undefined;
      const subject = batch
        ? sourceReviewBatchSubject(batch)
        : approvalSubject({ kind: 'source-review', id: input.id, proposalHash: input.proposalHash });
      const approval = await fetchEditorApproval(subject);
      if (!approval) {
        throw new Error(
          `The editor has not approved this proposal with their passkey. Send them ${approvalPageUrl(subject)}`,
        );
      }
      const verified = await verifyEditorApproval(approval, passkeys, subject);
      if (!verified.ok) throw new Error(verified.error);
      return decideSourceReview({
        id: input.id,
        proposalHash: input.proposalHash,
        reviewer: verified.passkey.reviewer,
        attestation: { kind: 'passkey', approval, ...(batch ? { batch } : {}) },
      });
    }
    if (input.batchId) {
      throw new Error('Batch approval needs a registered editor passkey');
    }

    const reviewer = requireSignalReviewer(input.reviewer);
    const attestationUrl = input.attestationUrl ?? '';
    if (!DECISION_CARD_URL.test(attestationUrl)) {
      throw new Error(
        'attestationUrl must link to the claude.ai decision card the editor answered',
      );
    }
    return decideSourceReview({
      id: input.id,
      proposalHash: input.proposalHash,
      reviewer,
      attestation: { kind: 'card', attestationUrl },
    });
  });
}

export async function handleRejectStagedSource(input: {
  id: string;
  reason?: string;
}) {
  return audited('reject_staged_source', {}, () => {
    return rejectStagedSource(input.id, input.reason);
  });
}

export async function handleRecordManualSourceReview(input: {
  sourceId: string;
  status: 'checked' | 'source_unavailable';
  reviewer?: string;
  notes?: string;
  evidence?: Omit<SourceEvidence, 'url'>;
}) {
  return audited('record_manual_source_review', {}, () => {
    const reviewer = input.reviewer?.trim();
    if (!reviewer) {
      throw new Error(
        'Manual source review requires the human reviewer identity',
      );
    }
    return recordManualSourceReview({
      sourceId: input.sourceId,
      status: input.status,
      actor: reviewer,
      notes: input.notes,
      ...(input.evidence ? { evidence: input.evidence } : {}),
    });
  });
}

function requireSignalReviewer(reviewer?: string) {
  const name = reviewer?.replace(/\s+/g, ' ').trim();
  if (!name) {
    throw new Error('A human reviewer identity is required');
  }
  if (!isSignalReviewer(name, process.env)) {
    throw new Error(
      `Signal reviewer must be one of: ${signalReviewers(process.env).join(', ')}.`,
    );
  }
  return name;
}

/**
 * Stamp a public register record verified after Daniel names that id in
 * Policai Signal. Requires the admin token and an allowlisted reviewer.
 */
export async function handleVerifyRegisterRecord(input: {
  policyId: string;
  reviewer?: string;
  notes?: string;
}) {
  return audited('verify_register_record', {}, () => {
    const reviewer = requireSignalReviewer(input.reviewer);
    return verifyRegisterRecord({
      policyId: input.policyId,
      actor: reviewer,
      notes: input.notes,
    });
  });
}

