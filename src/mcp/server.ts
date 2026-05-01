#!/usr/bin/env tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  handleAnalyseSourceUrl,
  handleCheckCoverage,
  handleListStagedSources,
  handlePublishStagedSource,
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
    description: 'Writes a source review proposal. Requires POLICAI_MCP_ADMIN_TOKEN. Does not publish.',
    inputSchema: {
      url: z.string().url(),
      entryKind: z.enum(['policy', 'timeline_event']),
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
    description: 'Marks a staged source rejected. Requires POLICAI_MCP_ADMIN_TOKEN.',
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
