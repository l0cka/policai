import { NextResponse } from 'next/server';
import { getLatestPipelineRun } from '@/lib/agents/pipeline-storage';
import { getRecentScraperRuns } from '@/lib/data-service';

export async function GET() {
  const [latestPipeline, recentScrapes] = await Promise.all([
    getLatestPipelineRun(),
    getRecentScraperRuns(1),
  ]);

  return NextResponse.json({
    lastPipelineRun: latestPipeline
      ? {
          id: latestPipeline.id,
          stage: latestPipeline.stage,
          startedAt: latestPipeline.startedAt,
          completedAt: latestPipeline.completedAt,
          findingsCount: latestPipeline.findingsCount,
          implementedCount: latestPipeline.implementedCount,
        }
      : null,
    lastScrapeRun: recentScrapes[0]
      ? {
          timestamp: recentScrapes[0].timestamp,
          sourceName: recentScrapes[0].sourceName,
          policiesCreated: recentScrapes[0].policiesCreated,
        }
      : null,
    success: true,
  });
}
