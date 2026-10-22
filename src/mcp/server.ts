#!/usr/bin/env tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  handleAnalyseSourceUrl,
  handleApproveStagedSource,
  handleCheckCoverage,
  handleListCourtRequirementCandidates,
  handleListStagedSources,
  handleListThemes,
  handleProposeSourceDecision,
  handlePublishStagedSource,
  handleRecordDecision,
  handleRecordManualSourceReview,
  handleRejectStagedSource,
  handleReviewCourtRequirement,
  handleShowSourceProposal,
  handleSignalDecision,
  handleStageSourceCapture,
  handleStageSourceUrl,
  handleVerifyRegisterRecord,
  toToolText,
} from './tool-handlers';
import {
  MAX_THEMES_PER_RECORD,
  MIN_RECORDS_PER_THEME,
  MIN_THEMES_PER_RECORD,
} from '@/lib/themes';

const server = new McpServer({
  name: 'policai-source-ingest',
  version: '0.1.0',
});

const browserCaptureSchema = z.object({
  pageTitle: z.string().min(1).max(500),
  pageText: z.string().min(20).max(500_000),
  references: z.array(z.string().url()).max(256),
  stableMetadata: z.array(z.object({
    key: z.string().min(1),
    value: z.string().min(1),
  })).max(32).optional(),
  capturedAt: z.string().datetime({ offset: true }),
  capturedBy: z.string().min(1),
  requestedBy: z.string().min(1).optional(),
  notes: z.string().min(20),
  linkedDocuments: z.array(z.object({
    url: z.string().url(),
    filePath: z.string().min(1),
  })).max(8),
});

server.registerTool(
  'check_coverage',
  {
    title: 'Check Policai coverage',
    description: 'Read-only search across tracked policies, manual timeline events, and staged sources.',
    inputSchema: {
      query: z.string().optional(),
      sourceUrl: z.string().url().optional(),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  async (input) => toToolText(await handleCheckCoverage(input)),
);

server.registerTool(
  'analyse_source_url',
  {
    title: 'Analyse source URL',
    description: 'Read-only analysis of an official source URL. Non-government URLs require stageOnly.',
    inputSchema: {
      url: z.string().url(),
      stageOnly: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: false,
      destructiveHint: false,
    },
  },
  async (input) => toToolText(await handleAnalyseSourceUrl(input)),
);

server.registerTool(
  'stage_source_url',
  {
    title: 'Stage source URL',
    description:
      'Writes a source review proposal. If the URL belongs to tracked records, use entryKind and targetRecordId to select the record to re-verify; targetRecordId is required when multiple records of that kind share the URL. proposedRecord sets the exact record to publish, edits included. Requires POLICAI_MCP_ADMIN_TOKEN. Does not publish.',
    inputSchema: {
      url: z.string().url(),
      entryKind: z.enum(['policy', 'timeline_event']),
      targetRecordId: z.string().min(1).optional(),
      proposedRecord: z.record(z.string(), z.unknown()).optional(),
      notes: z.string().optional(),
      stageOnly: z.boolean().optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleStageSourceUrl(input)),
);

server.registerTool(
  'stage_source_capture',
  {
    title: 'Stage browser-captured source',
    description:
      `Stages a fresh, reviewer-attributed browser capture when the official source blocks the hardened server-side retriever. Existing policy or timeline records use targetRecordId; new records require an explicit proposedRecord; replacing a target URL additionally requires replaceTargetSource and a proposedRecord preserving its id. A policy proposedRecord needs ${MIN_THEMES_PER_RECORD} to ${MAX_THEMES_PER_RECORD} themes, keys listed by list_themes, before it can be approved. A timeline replacement may share its already-related policy canonical URL, but not unrelated identities. The capture includes normalized page text and local bytes for linked canonical documents; paths are validated and never persisted. Requires POLICAI_MCP_ADMIN_TOKEN. Does not approve or publish.`,
    inputSchema: {
      url: z.string().url(),
      entryKind: z.enum(['policy', 'timeline_event']),
      targetRecordId: z.string().min(1).optional(),
      proposedRecord: z.record(z.string(), z.unknown()).optional(),
      replaceTargetSource: z.boolean().optional(),
      notes: z.string().optional(),
      capture: browserCaptureSchema,
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleStageSourceCapture(input)),
);

server.registerTool(
  'list_staged_sources',
  {
    title: 'List staged sources',
    description: 'Read-only list of staged source review proposals.',
    inputSchema: {
      status: z.enum(['pending_review', 'approved', 'published', 'rejected']).optional(),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  async (input) => toToolText(await handleListStagedSources(input)),
);

server.registerTool(
  'show_source_proposal',
  {
    title: 'Show source proposal',
    description:
      'Read-only. Returns what a decision card must show for one staged review: the current record, the proposed record, the source evidence, and proposalHash with its short proposalCode. Post a decision card with that content, then pass proposalHash to record_decision once the editor taps Approve.',
    inputSchema: {
      id: z.string().min(1),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  async (input) => toToolText(await handleShowSourceProposal(input)),
);

server.registerTool(
  'propose_source_decision',
  {
    title: 'Propose source decision',
    description:
      'Prepares everything a pending review needs for approval, so the editor decides on one complete proposal: the edited proposedRecord, reviewedDate for a date the source shows but does not expose as metadata, manualExtraction, officialSourceUrl for a stage-only lead, or expectedTargetRevisionHash after a rebase. proposedBy names who prepared it honestly, for example "Claude (agent)". Returns proposalHash. Requires POLICAI_MCP_ADMIN_TOKEN. Does not approve or publish.',
    inputSchema: {
      id: z.string().min(1),
      proposedBy: z.string().min(1),
      proposedRecord: z.record(z.string(), z.unknown()).optional(),
      expectedTargetRevisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      officialSourceUrl: z.string().url().optional(),
      manualExtraction: z.object({
        method: z.enum(['ocr', 'manual_transcription']),
        title: z.string().min(1),
        text: z.string().min(20),
        publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        publishedAtPrecision: z.enum(['day', 'month', 'year']).optional(),
        notes: z.string().min(1),
      }).optional(),
      reviewedDate: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        precision: z.enum(['day', 'month', 'year']),
        notes: z.string().min(20),
      }).optional(),
      notes: z.string().optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
    },
  },
  async (input) => toToolText(await handleProposeSourceDecision(input)),
);

server.registerTool(
  'record_decision',
  {
    title: 'Record editor decision',
    description:
      'Approves and publishes a staged review after the editor tapped Approve on a Policai project decision card. Call it only with the proposalHash the card showed and the link to that card; a typed "go ahead" is not a decision. Refuses when the review changed since the card was posted, when the reviewer is not on the editor allowlist (POLICAI_SIGNAL_REVIEWERS, default Daniel Alkurdi), or when a staged browser capture is over 7 days old. Retrying the same decision resumes a failed publication. Requires POLICAI_MCP_ADMIN_TOKEN.',
    inputSchema: {
      id: z.string().min(1),
      proposalHash: z.string().regex(/^[a-f0-9]{64}$/),
      reviewer: z.string().min(1),
      attestationUrl: z.string().url(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleRecordDecision(input)),
);

server.registerTool(
  'list_themes',
  {
    title: 'List policy themes',
    description: `Read-only list of the theme vocabulary in src/lib/themes.ts, in table order, as key and label. Give a policy record ${MIN_THEMES_PER_RECORD} to ${MAX_THEMES_PER_RECORD} unique keys in proposedRecord.themes; labels are display text only. Every listed theme must be on at least ${MIN_RECORDS_PER_THEME} register records; fewer than ${MIN_RECORDS_PER_THEME} public records is only a warning.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  async () => toToolText(handleListThemes()),
);

server.registerTool(
  'list_court_requirement_candidates',
  {
    title: 'List court requirement candidates',
    description:
      'Read-only list of source-anchored court requirement candidates and their review status. Pending and rejected records remain editorial and are never returned by the public API or WebMCP.',
    inputSchema: {
      status: z.enum(['pending_review', 'verified', 'rejected']).optional(),
      policyId: z.string().min(1).max(200).optional(),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
    },
  },
  async (input) =>
    toToolText(await handleListCourtRequirementCandidates(input)),
);

server.registerTool(
  'review_court_requirement',
  {
    title: 'Review a court requirement candidate',
    description:
      'Verifies or rejects one pending court requirement after human comparison with its exact quote and pinpoint. Verification re-checks the candidate against the current policy source fingerprint. Requires a human reviewer identity and POLICAI_MCP_ADMIN_TOKEN.',
    inputSchema: {
      id: z.string().min(1).max(200),
      decision: z.enum(['verified', 'rejected']),
      reviewer: z.string().min(1).max(200),
      notes: z.string().min(20).max(2_000),
      revision: z.object({
        actor: z.string().min(1).max(500).optional(),
        modality: z.enum(['must', 'must_not', 'should', 'should_not', 'may', 'will']).optional(),
        action: z.string().min(1).max(2_000).optional(),
        conditions: z.array(z.string().min(1).max(1_000)).max(20).optional(),
        exceptions: z.array(z.string().min(1).max(1_000)).max(20).optional(),
        topics: z.array(z.string().min(1).max(200)).max(20).optional(),
      }).optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleReviewCourtRequirement(input)),
);

server.registerTool(
  'approve_staged_source',
  {
    title: 'Approve staged source',
    description:
      `Validates and explicitly approves a complete source review before publication. Requires the human reviewer identity separately from the admin token. If a tracked target changed after staging, submit the rebased proposedRecord with expectedTargetRevisionHash from the refreshed review. Stage-only leads require an officialSourceUrl plus an explicitly reviewed replacement proposedRecord; the official source is fetched again and replaces the discovery evidence. Dates must match extracted metadata or include explicit reviewedDate evidence. A policy record needs ${MIN_THEMES_PER_RECORD} to ${MAX_THEMES_PER_RECORD} themes, keys listed by list_themes; collector drafts have none, so a new policy is approved with an explicit proposedRecord carrying themes. Requires POLICAI_MCP_ADMIN_TOKEN.`,
    inputSchema: {
      id: z.string(),
      reviewer: z.string().min(1),
      proposedRecord: z.record(z.string(), z.unknown()).optional(),
      expectedTargetRevisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      officialSourceUrl: z.string().url().optional(),
      approvalNotes: z.string().optional(),
      manualExtraction: z.object({
        method: z.enum(['ocr', 'manual_transcription']),
        title: z.string().min(1),
        text: z.string().min(20),
        publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        publishedAtPrecision: z.enum(['day', 'month', 'year']).optional(),
        notes: z.string().min(1),
      }).optional(),
      reviewedDate: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        precision: z.enum(['day', 'month', 'year']),
        notes: z.string().min(20),
      }).optional(),
      browserCapture: browserCaptureSchema.optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleApproveStagedSource(input)),
);

server.registerTool(
  'record_manual_source_review',
  {
    title: 'Record a manual source review',
    description:
      'Records an explicit browser-based check for a catalogue source that cannot be collected reliably. Requires the human reviewer identity separately from POLICAI_MCP_ADMIN_TOKEN.',
    inputSchema: {
      sourceId: z.string(),
      status: z.enum(['checked', 'source_unavailable']),
      reviewer: z.string().min(1),
      notes: z.string().min(20),
      evidence: z.object({
        finalUrl: z.string().url().optional(),
        title: z.string().min(1).optional(),
        publisher: z.string().min(1).optional(),
        retrievedAt: z.string().datetime().optional(),
        publishedAt: z.string().optional(),
        publishedAtPrecision: z.enum(['day', 'month', 'year']).optional(),
        contentType: z.string().min(1).optional(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        etag: z.string().min(1).optional(),
        lastModified: z.string().min(1).optional(),
      }).optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
    },
  },
  async (input) => toToolText(await handleRecordManualSourceReview(input)),
);

server.registerTool(
  'publish_staged_source',
  {
    title: 'Publish staged source',
    description: 'Publishes a staged source review into Policai data. Requires POLICAI_MCP_ADMIN_TOKEN.',
    inputSchema: {
      id: z.string(),
      browserCapture: browserCaptureSchema.optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handlePublishStagedSource(input)),
);

server.registerTool(
  'reject_staged_source',
  {
    title: 'Reject staged source',
    description:
      'Marks a new-source proposal rejected and then dismisses its radar lead. Reviews targeting existing policies or timeline events must instead be approved and published to re-verify the record. Requires POLICAI_MCP_ADMIN_TOKEN.',
    inputSchema: {
      id: z.string(),
      reason: z.string().optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleRejectStagedSource(input)),
);

server.registerTool(
  'verify_register_record',
  {
    title: 'Verify register record',
    description:
      'Stamps a public register policy as editorially verified after a named human decision (Policai Signal). Sets lastReviewedAt and verification.status=verified. Refuses withheld, unverified, and trashed records. Requires an allowlisted Signal reviewer (POLICAI_SIGNAL_REVIEWERS, default Daniel) and POLICAI_MCP_ADMIN_TOKEN. Agents must not call this unless that human named the policy id verified.',
    inputSchema: {
      policyId: z.string().min(1),
      reviewer: z.string().min(1),
      notes: z.string().optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleVerifyRegisterRecord(input)),
);

server.registerTool(
  'signal_decision',
  {
    title: 'Signal decision',
    description:
      'Laptop recovery only (not the Grok Bot product path). Approve, dismiss, publish, or verify a staged review via MCP when HTTPS /api/signal/reviews is unavailable. Product path: GET/POST /api/signal/reviews with POLICAI_SIGNAL_TOKEN. Approve/dismiss/verify require an allowlisted reviewer (default Daniel Alkurdi). Publish requires a previously approved review. Requires POLICAI_MCP_ADMIN_TOKEN. Does not commit or push; the host must validate and commit after a write.',
    inputSchema: {
      action: z.enum(['approve', 'dismiss', 'publish', 'verify']),
      id: z.string().min(1),
      reviewer: z.string().min(1).optional(),
      notes: z.string().optional(),
      proposedRecord: z.record(z.string(), z.unknown()).optional(),
      expectedTargetRevisionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      officialSourceUrl: z.string().url().optional(),
      manualExtraction: z.object({
        method: z.enum(['ocr', 'manual_transcription']),
        title: z.string().min(1),
        text: z.string().min(20),
        publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        publishedAtPrecision: z.enum(['day', 'month', 'year']).optional(),
        notes: z.string().min(1),
      }).optional(),
      reviewedDate: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        precision: z.enum(['day', 'month', 'year']),
        notes: z.string().min(20),
      }).optional(),
      browserCapture: browserCaptureSchema.optional(),
      adminToken: z.string(),
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: true,
    },
  },
  async (input) => toToolText(await handleSignalDecision(input)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
