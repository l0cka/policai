/**
 * Vercel Cron endpoint — runs the full AI research pipeline.
 *
 * Triggered weekly (see vercel.json). Runs the research agent, verifier agent,
 * and auto-approves high-confidence findings for implementation.
 *
 * Protected by CRON_SECRET so only Vercel infrastructure can invoke it.
 */

import { NextResponse } from 'next/server';
import { startPipelineRun } from '@/lib/agents/pipeline';
import { getPolicies } from '@/lib/data-service';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron/pipeline] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'CRON_SECRET not configured', success: false },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY not configured', success: false },
      { status: 500 },
    );
  }

  console.log(`[cron/pipeline] Starting pipeline at ${new Date().toISOString()}`);

  try {
    const policies = await getPolicies();
    const existingTitles = policies.map((p) => p.title);
    const existingSourceUrls = policies.map((p) => p.sourceUrl).filter(Boolean);

    const run = await startPipelineRun(existingTitles, {
      autoApprove: true,
      autoApproveThreshold: 0.8,
      existingSourceUrls,
    });

    console.log(`[cron/pipeline] Completed. Stage: ${run.stage}, Implemented: ${run.implementedCount}`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      run: {
        id: run.id,
        stage: run.stage,
        findingsCount: run.findingsCount,
        verifiedCount: run.verifiedCount,
        implementedCount: run.implementedCount,
        rejectedCount: run.rejectedCount,
      },
    });
  } catch (error) {
    console.error('[cron/pipeline] Failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Pipeline failed',
      },
      { status: 500 },
    );
  }
}
