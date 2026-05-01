import {
  analyseSourceUrl,
  auditMcpTool,
  checkCoverage,
  normalizeReviewStatus,
  publishStagedSource,
  rejectStagedSource,
  stageSourceUrl,
} from '@/lib/source-ingest';
import { getSourceReviews } from '@/lib/data-service';
import type { SourceReviewEntryKind } from '@/types';

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
  notes?: string;
  stageOnly?: boolean;
  adminToken?: string;
}) {
  return audited('stage_source_url', { sourceUrl: input.url }, () => {
    requireMcpAdminToken(input.adminToken);
    return stageSourceUrl({
      url: input.url,
      entryKind: input.entryKind,
      notes: input.notes,
      actor: MCP_ACTOR,
      stageOnly: input.stageOnly,
    });
  });
}

export async function handleListStagedSources(input: { status?: string }) {
  const status = normalizeReviewStatus(input.status);
  return getSourceReviews(status ? { status } : undefined);
}

export async function handlePublishStagedSource(input: { id: string; adminToken?: string }) {
  return audited('publish_staged_source', {}, () => {
    requireMcpAdminToken(input.adminToken);
    return publishStagedSource(input.id);
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
