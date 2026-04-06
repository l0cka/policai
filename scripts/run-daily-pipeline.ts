#!/usr/bin/env tsx
/**
 * Daily AI Review Pipeline Runner
 *
 * Runs the full research and verification pipeline daily.
 * After research and verification, findings are stored for human review.
 * The admin must approve findings via the dashboard before implementation.
 *
 * Usage:
 *   tsx scripts/run-daily-pipeline.ts
 *
 * Cron example (run daily at 6 AM AEST):
 *   0 6 * * * cd /path/to/Policai && tsx scripts/run-daily-pipeline.ts >> logs/pipeline.log 2>&1
 */

const PIPELINE_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function runDailyPipeline() {
  console.log('='.repeat(60));
  console.log('Daily AI Review Pipeline');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  // Check if API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set');
    process.exit(1);
  }

  try {
    // Check if there's already a pipeline run waiting for review
    console.log('\nChecking for pending pipeline reviews...');
    const statusResponse = await fetch(`${PIPELINE_API_URL}/api/admin/pipeline?action=latest`);
    const statusData = await statusResponse.json();

    if (statusData.success && statusData.data?.run?.stage === 'hitl_review') {
      console.log('A pipeline run is already awaiting human review.');
      console.log(`Run ID: ${statusData.data.run.id}`);
      console.log(`Findings: ${statusData.data.run.findingsCount}`);
      console.log(`Verified: ${statusData.data.run.verifiedCount}`);
      console.log('\nPlease review and approve/reject via the admin dashboard before running a new pipeline.');
      process.exit(0);
    }

    // Start a new pipeline run
    console.log('\nStarting pipeline run...');
    console.log('Stage 1: Research Agent scanning sources...');
    console.log('Stage 2: Verifier Agent cross-referencing findings...');
    console.log('(This may take several minutes)\n');

    const response = await fetch(`${PIPELINE_API_URL}/api/admin/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Pipeline failed');
    }

    const run = result.data;
    console.log('Pipeline run completed successfully.');
    console.log(`Run ID: ${run.id}`);
    console.log(`Stage: ${run.stage}`);
    console.log(`Sources scanned: ${run.sourcesScanned?.length || 0}`);
    console.log(`Findings discovered: ${run.findingsCount}`);
    console.log(`Findings verified: ${run.verifiedCount}`);
    console.log(`Findings rejected: ${run.rejectedCount}`);

    if (run.stage === 'hitl_review') {
      console.log('\nPipeline paused for human review.');
      console.log('Please visit the admin dashboard to approve or reject findings.');
    } else if (run.stage === 'complete' && run.findingsCount === 0) {
      console.log('\nNo new findings discovered. The policy database is up to date.');
    }

  } catch (error) {
    console.error('Pipeline error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Completed at: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
}

runDailyPipeline().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
