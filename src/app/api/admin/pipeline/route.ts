import { NextResponse } from 'next/server';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth';
import {
  getPipelineRuns,
  getLatestPipelineRun,
  getFindings,
  getVerifications,
} from '@/lib/agents/pipeline-storage';
import {
  startPipelineRun,
  approvePipelineRun,
  rejectPipelineRun,
} from '@/lib/agents/pipeline';
import { getPolicies } from '@/lib/data-service';

async function getExistingPolicyTitles(): Promise<string[]> {
  const policies = await getPolicies(undefined, { access: 'admin' });
  return policies.map((p) => p.title);
}

/**
 * GET /api/admin/pipeline
 * Retrieve pipeline runs, findings, and verification results
 *
 * Query params:
 * - action: 'runs' | 'latest' | 'findings' | 'verifications'
 * - runId: pipeline run ID (for findings/verifications)
 */
export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'latest';
  const runId = searchParams.get('runId');

  try {
    switch (action) {
      case 'runs': {
        const runs = await getPipelineRuns();
        return NextResponse.json({
          success: true,
          data: runs.sort((a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          ),
        });
      }

      case 'latest': {
        const latest = await getLatestPipelineRun();
        if (!latest) {
          return NextResponse.json({
            success: true,
            data: null,
            message: 'No pipeline runs found',
          });
        }

        const findings = await getFindings(latest.id);
        const verifications = await getVerifications(latest.id);

        return NextResponse.json({
          success: true,
          data: {
            run: latest,
            findings,
            verifications,
          },
        });
      }

      case 'findings': {
        const findings = await getFindings(runId || undefined);
        return NextResponse.json({ success: true, data: findings });
      }

      case 'verifications': {
        const verifications = await getVerifications(runId || undefined);
        return NextResponse.json({ success: true, data: verifications });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch pipeline data',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/pipeline
 * Trigger pipeline actions
 *
 * Body:
 * - action: 'start' | 'approve' | 'reject'
 * - runId: pipeline run ID (for approve/reject)
 * - notes: optional notes
 * - approvedFindingIds: optional array of finding IDs to approve (for selective approval)
 */
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { action, runId, notes, approvedFindingIds } = body;

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      );
    }

    switch (action) {
      case 'start': {
        const existingTitles = await getExistingPolicyTitles();
        const run = await startPipelineRun(existingTitles);

        return NextResponse.json({
          success: true,
          data: run,
          message: run.stage === 'hitl_review'
            ? `Pipeline paused for review. ${run.findingsCount} findings discovered, ${run.verifiedCount} verified.`
            : run.stage === 'complete'
            ? 'Pipeline complete. No new findings discovered.'
            : `Pipeline at stage: ${run.stage}`,
        });
      }

      case 'approve': {
        if (!runId) {
          return NextResponse.json(
            { success: false, error: 'runId is required' },
            { status: 400 }
          );
        }

        const approvedRun = await approvePipelineRun(
          runId,
          user.email || 'admin',
          notes,
          approvedFindingIds
        );

        return NextResponse.json({
          success: true,
          data: approvedRun,
          message: `Pipeline approved and implemented. ${approvedRun.implementedCount} policies created/updated.`,
        });
      }

      case 'reject': {
        if (!runId) {
          return NextResponse.json(
            { success: false, error: 'runId is required' },
            { status: 400 }
          );
        }

        const rejectedRun = await rejectPipelineRun(
          runId,
          user.email || 'admin',
          notes
        );

        return NextResponse.json({
          success: true,
          data: rejectedRun,
          message: 'Pipeline run rejected. No changes were made.',
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: start, approve, reject' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Pipeline operation failed',
      },
      { status: 500 }
    );
  }
}
