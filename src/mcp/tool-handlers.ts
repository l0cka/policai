import {
	analyseSourceUrl,
	approveStagedSource,
	auditMcpTool,
  type BrowserCaptureInput,
  type ManualExtractionInput,
  type ReviewedDateInput,
  checkCoverage,
  normalizeReviewStatus,
  publishStagedSource,
  recordManualSourceReview,
  rejectStagedSource,
  stageSourceCapture,
  stageSourceUrl,
  verifyRegisterRecord,
} from '@/lib/source-ingest';
import { getSourceReviews } from '@/lib/data-service';
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

export function requireMcpAdminToken(token?: string) {
  const expected = process.env.POLICAI_MCP_ADMIN_TOKEN;
  if (!expected) {
    throw new Error('POLICAI_MCP_ADMIN_TOKEN is not configured');
  }
  if (token !== expected) {
    throw new Error('Invalid POLICAI_MCP_ADMIN_TOKEN');
  }
}

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
  input: { sourceUrl?: string; adminToken?: string },
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
  notes?: string;
  stageOnly?: boolean;
  adminToken?: string;
}) {
  return audited('stage_source_url', { sourceUrl: input.url }, () => {
    requireMcpAdminToken(input.adminToken);
    return stageSourceUrl({
      url: input.url,
      entryKind: input.entryKind,
      targetRecordId: input.targetRecordId,
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
  adminToken?: string;
}) {
  return audited('stage_source_capture', { sourceUrl: input.url }, () => {
    requireMcpAdminToken(input.adminToken);
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
  adminToken?: string;
}) {
  return audited('review_court_requirement', {}, () => {
    requireMcpAdminToken(input.adminToken);
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

export async function handleApproveStagedSource(input: {
  id: string;
  reviewer?: string;
  proposedRecord?: Record<string, unknown>;
  expectedTargetRevisionHash?: string;
  officialSourceUrl?: string;
  approvalNotes?: string;
  manualExtraction?: ManualExtractionInput;
  reviewedDate?: ReviewedDateInput;
  browserCapture?: BrowserCaptureInput;
  adminToken?: string;
}) {
  return audited('approve_staged_source', {}, () => {
    requireMcpAdminToken(input.adminToken);
    const reviewer = input.reviewer?.trim();
    if (!reviewer) {
      throw new Error('A human reviewer identity is required');
    }
    return approveStagedSource({
      id: input.id,
      actor: reviewer,
      proposedRecord: input.proposedRecord as
        | PolicyDraft
        | TimelineEventDraft
        | undefined,
      expectedTargetRevisionHash: input.expectedTargetRevisionHash,
      officialSourceUrl: input.officialSourceUrl,
      approvalNotes: input.approvalNotes,
      manualExtraction: input.manualExtraction,
      reviewedDate: input.reviewedDate,
      browserCapture: input.browserCapture,
    });
  });
}

export async function handlePublishStagedSource(input: {
  id: string;
  browserCapture?: BrowserCaptureInput;
  adminToken?: string;
}) {
  return audited('publish_staged_source', {}, () => {
    requireMcpAdminToken(input.adminToken);
    return publishStagedSource(input.id, {
      browserCapture: input.browserCapture,
    });
  });
}

export async function handleRejectStagedSource(input: {
  id: string;
  reason?: string;
  adminToken?: string;
}) {
  return audited('reject_staged_source', {}, () => {
    requireMcpAdminToken(input.adminToken);
    return rejectStagedSource(input.id, input.reason);
  });
}

export async function handleRecordManualSourceReview(input: {
  sourceId: string;
  status: 'checked' | 'source_unavailable';
  reviewer?: string;
  notes?: string;
  evidence?: Omit<SourceEvidence, 'url'>;
  adminToken?: string;
}) {
  return audited('record_manual_source_review', {}, () => {
    requireMcpAdminToken(input.adminToken);
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
  adminToken?: string;
}) {
  return audited('verify_register_record', {}, () => {
    requireMcpAdminToken(input.adminToken);
    const reviewer = requireSignalReviewer(input.reviewer);
    return verifyRegisterRecord({
      policyId: input.policyId,
      actor: reviewer,
      notes: input.notes,
    });
  });
}

/**
 * One entry for the Signal Grok Bot phrase table: approve, dismiss, publish,
 * or verify. Same trust gates as the individual tools plus the Signal
 * reviewer allowlist on approve / dismiss / verify.
 */
export async function handleSignalDecision(input: {
  action: 'approve' | 'dismiss' | 'publish' | 'verify';
  id: string;
  reviewer?: string;
  notes?: string;
  proposedRecord?: Record<string, unknown>;
  expectedTargetRevisionHash?: string;
  officialSourceUrl?: string;
  manualExtraction?: ManualExtractionInput;
  reviewedDate?: ReviewedDateInput;
  browserCapture?: BrowserCaptureInput;
  adminToken?: string;
}) {
  requireMcpAdminToken(input.adminToken);
  const id = input.id.trim();
  if (!id) {
    throw new Error(
      input.action === 'verify'
        ? 'A register policy id is required'
        : 'A source review id is required',
    );
  }

  if (input.action === 'publish') {
    return audited('signal_decision', {}, () =>
      publishStagedSource(id, { browserCapture: input.browserCapture }),
    );
  }

  const reviewer = requireSignalReviewer(input.reviewer);
  const notes =
    input.notes?.replace(/\s+/g, ' ').trim() ||
    `Policai Signal decision (${input.action}) by ${reviewer}`;

  if (input.action === 'verify') {
    return audited('signal_decision', {}, () =>
      verifyRegisterRecord({ policyId: id, actor: reviewer, notes }),
    );
  }

  if (input.action === 'dismiss') {
    return audited('signal_decision', {}, () =>
      rejectStagedSource(id, notes),
    );
  }

  return audited('signal_decision', {}, () =>
    approveStagedSource({
      id,
      actor: reviewer,
      approvalNotes: notes,
      proposedRecord: input.proposedRecord as
        | PolicyDraft
        | TimelineEventDraft
        | undefined,
      expectedTargetRevisionHash: input.expectedTargetRevisionHash,
      officialSourceUrl: input.officialSourceUrl,
      manualExtraction: input.manualExtraction,
      reviewedDate: input.reviewedDate,
      browserCapture: input.browserCapture,
    }),
  );
}
