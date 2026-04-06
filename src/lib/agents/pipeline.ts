import type { PipelineRun, PipelineStage } from '@/types';
import {
  savePipelineRun,
  getPipelineRun,
  getFindings,
  getVerifications,
} from './pipeline-storage';
import { runResearchAgent } from './research-agent';
import { runVerifierAgent } from './verifier-agent';
import { runImplementationAgent } from './implementation-agent';

/**
 * Generate a unique pipeline run ID
 */
function generateRunId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${date}-${rand}`;
}

export interface PipelineOptions {
  /** Skip HITL for high-confidence findings and auto-implement them. */
  autoApprove?: boolean;
  /** Verification confidence threshold for auto-approve (default 0.8). */
  autoApproveThreshold?: number;
}

/**
 * Start a new pipeline run - executes the Research Agent and Verifier Agent,
 * then pauses for HITL review before implementation.
 *
 * Pipeline stages:
 * 1. research        -> Research Agent scans sources
 * 2. research_complete -> Findings stored
 * 3. verification    -> Verifier Agent checks findings
 * 4. verification_complete -> HITL checkpoint #1 (post-verification)
 * 5. hitl_review     -> Waiting for human approval (skipped if autoApprove)
 * 6. implementation  -> Implementation Agent applies changes
 * 7. complete        -> Done
 */
export async function startPipelineRun(
  existingPolicyTitles: string[],
  options?: PipelineOptions,
): Promise<PipelineRun> {
  const runId = generateRunId();
  const run: PipelineRun = {
    id: runId,
    startedAt: new Date().toISOString(),
    stage: 'research',
    sourcesScanned: [],
    findingsCount: 0,
    verifiedCount: 0,
    implementedCount: 0,
    rejectedCount: 0,
    hitlRequired: true,
  };

  await savePipelineRun(run);
  console.log(`[Pipeline] Started run: ${runId}`);

  try {
    // Stage 1: Research
    await updateStage(run, 'research');
    const researchResult = await runResearchAgent(runId, existingPolicyTitles);

    run.sourcesScanned = researchResult.sourcesScanned;
    run.findingsCount = researchResult.findings.length;
    await updateStage(run, 'research_complete');

    if (researchResult.findings.length === 0) {
      console.log('[Pipeline] No findings discovered. Completing.');
      run.completedAt = new Date().toISOString();
      await updateStage(run, 'complete');
      return run;
    }

    // Stage 2: Verification
    await updateStage(run, 'verification');
    const verifierResult = await runVerifierAgent(researchResult.findings);

    run.verifiedCount = verifierResult.confirmedCount;
    run.rejectedCount = verifierResult.rejectedCount;
    await updateStage(run, 'verification_complete');

    // Stage 3: HITL checkpoint or auto-approve
    const autoApprove = options?.autoApprove ?? false;
    const threshold = options?.autoApproveThreshold ?? 0.8;

    if (autoApprove) {
      // Auto-approve verified findings above the confidence threshold
      const allFindings = await getFindings(runId);
      const allVerifications = await getVerifications(runId);
      const verificationMap = new Map(allVerifications.map(v => [v.findingId, v]));

      const highConfFindings = allFindings.filter(f => {
        if (f.status !== 'verified') return false;
        const v = verificationMap.get(f.id);
        return v && v.confidenceScore >= threshold;
      });

      if (highConfFindings.length > 0) {
        console.log(`[Pipeline] Auto-approving ${highConfFindings.length} high-confidence findings (threshold: ${threshold})`);

        run.hitlApprovedAt = new Date().toISOString();
        run.hitlApprovedBy = 'auto';
        run.hitlNotes = `Auto-approved ${highConfFindings.length} findings with confidence >= ${threshold}`;

        await updateStage(run, 'implementation');
        const implResult = await runImplementationAgent(highConfFindings, allVerifications);
        run.implementedCount = implResult.createdCount + implResult.updatedCount;

        run.completedAt = new Date().toISOString();
        await updateStage(run, 'complete');

        console.log(`[Pipeline] Run ${runId} auto-completed. Implemented: ${run.implementedCount}`);
      } else {
        run.completedAt = new Date().toISOString();
        await updateStage(run, 'complete');
        console.log(`[Pipeline] Run ${runId} completed. No findings met auto-approve threshold.`);
      }

      return run;
    }

    // Manual mode: pause for human review
    await updateStage(run, 'hitl_review');

    console.log(`[Pipeline] Run ${runId} paused at HITL review.`);
    console.log(`  Findings: ${run.findingsCount}, Verified: ${run.verifiedCount}, Rejected: ${run.rejectedCount}`);

    return run;
  } catch (err) {
    run.error = err instanceof Error ? err.message : 'Unknown pipeline error';
    run.stage = 'failed';
    await savePipelineRun(run);
    console.error(`[Pipeline] Run ${runId} failed:`, run.error);
    return run;
  }
}

/**
 * Approve a pipeline run at the HITL checkpoint and proceed to implementation.
 * This is called after a human reviews the verified findings.
 */
export async function approvePipelineRun(
  runId: string,
  approvedBy: string,
  notes?: string,
  approvedFindingIds?: string[]
): Promise<PipelineRun> {
  const run = await getPipelineRun(runId);
  if (!run) {
    throw new Error(`Pipeline run ${runId} not found`);
  }

  if (run.stage !== 'hitl_review') {
    throw new Error(`Pipeline run ${runId} is not at HITL review stage (current: ${run.stage})`);
  }

  run.hitlApprovedAt = new Date().toISOString();
  run.hitlApprovedBy = approvedBy;
  run.hitlNotes = notes;

  try {
    // Stage 4: Implementation
    await updateStage(run, 'implementation');

    let findings = await getFindings(runId);
    const verifications = await getVerifications(runId);

    // If specific findings were approved, only implement those
    if (approvedFindingIds && approvedFindingIds.length > 0) {
      findings = findings.filter(f =>
        approvedFindingIds.includes(f.id) && f.status === 'verified'
      );
    } else {
      // Default: implement all verified findings
      findings = findings.filter(f => f.status === 'verified');
    }

    const implResult = await runImplementationAgent(findings, verifications);

    run.implementedCount = implResult.createdCount + implResult.updatedCount;

    // Stage 5: Complete
    run.completedAt = new Date().toISOString();
    await updateStage(run, 'complete');

    console.log(`[Pipeline] Run ${runId} completed. Implemented: ${run.implementedCount}`);

    return run;
  } catch (err) {
    run.error = err instanceof Error ? err.message : 'Implementation error';
    run.stage = 'failed';
    await savePipelineRun(run);
    throw err;
  }
}

/**
 * Reject a pipeline run at the HITL checkpoint (discard all findings)
 */
export async function rejectPipelineRun(
  runId: string,
  rejectedBy: string,
  notes?: string
): Promise<PipelineRun> {
  const run = await getPipelineRun(runId);
  if (!run) {
    throw new Error(`Pipeline run ${runId} not found`);
  }

  if (run.stage !== 'hitl_review') {
    throw new Error(`Pipeline run ${runId} is not at HITL review stage (current: ${run.stage})`);
  }

  run.hitlApprovedBy = rejectedBy;
  run.hitlNotes = notes || 'Rejected by admin';
  run.completedAt = new Date().toISOString();
  run.stage = 'complete';
  run.implementedCount = 0;

  await savePipelineRun(run);
  console.log(`[Pipeline] Run ${runId} rejected by ${rejectedBy}.`);

  return run;
}

async function updateStage(run: PipelineRun, stage: PipelineStage) {
  run.stage = stage;
  await savePipelineRun(run);
  console.log(`[Pipeline] ${run.id} -> ${stage}`);
}
