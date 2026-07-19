#!/usr/bin/env tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  handleAnalyseSourceUrl,
  handleApproveStagedSource,
  handleCheckCoverage,
  handleListStagedSources,
  handlePublishStagedSource,
  handleRecordManualSourceReview,
  handleRejectStagedSource,
  handleStageSourceUrl,
  toToolText,
} from './tool-handlers';

const server = new McpServer({
  name: 'policai-source-ingest',
  version: '0.1.0',
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
      'Writes a source review proposal. If the URL belongs to tracked records, use entryKind and targetRecordId to select the record to re-verify; targetRecordId is required when multiple records of that kind share the URL. Requires POLICAI_MCP_ADMIN_TOKEN. Does not publish.',
    inputSchema: {
      url: z.string().url(),
      entryKind: z.enum(['policy', 'timeline_event']),
      targetRecordId: z.string().min(1).optional(),
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
  'approve_staged_source',
  {
    title: 'Approve staged source',
    description:
      'Validates and explicitly approves a complete source review before publication. Requires the human reviewer identity separately from the admin token. If a tracked target changed after staging, submit the rebased proposedRecord with expectedTargetRevisionHash from the refreshed review. Stage-only leads require an officialSourceUrl plus an explicitly reviewed replacement proposedRecord; the official source is fetched again and replaces the discovery evidence. Dates must match extracted metadata or include explicit reviewedDate evidence. Requires POLICAI_MCP_ADMIN_TOKEN.',
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
