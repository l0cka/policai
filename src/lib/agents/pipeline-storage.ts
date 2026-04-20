import fs from 'fs/promises';
import path from 'path';
import type {
  PipelineRun,
  ResearchFinding,
  VerificationResult,
} from '@/types';
import { readJsonFile, writeJsonFile } from '@/lib/file-store';
import { isSupabaseConfigured, isSupabaseAdminConfigured } from '@/lib/data-service';

// ---------------------------------------------------------------------------
// Supabase helper (lazy import to avoid build errors without env vars)
// ---------------------------------------------------------------------------

async function getSupabase() {
  const { createSupabaseAdminClient } = await import('@/lib/supabase-admin');
  return createSupabaseAdminClient();
}

// ---------------------------------------------------------------------------
// JSON file fallback paths
// ---------------------------------------------------------------------------

const PIPELINE_DIR = path.join(process.cwd(), 'data', 'pipeline');
const RUNS_FILE = path.join(PIPELINE_DIR, 'pipeline-runs.json');
const FINDINGS_FILE = path.join(PIPELINE_DIR, 'research-findings.json');
const VERIFICATIONS_FILE = path.join(PIPELINE_DIR, 'verification-results.json');

async function ensureDir() {
  await fs.mkdir(PIPELINE_DIR, { recursive: true });
}

async function writeJsonWithDir(filePath: string, data: unknown) {
  await ensureDir();
  await writeJsonFile(filePath, data);
}

// ---------------------------------------------------------------------------
// Pipeline Runs
// ---------------------------------------------------------------------------

export async function getPipelineRuns(): Promise<PipelineRun[]> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select('*')
        .order('startedAt', { ascending: false });
      if (!error && data) return data as PipelineRun[];
      console.warn('[pipeline-storage] Supabase getPipelineRuns failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase getPipelineRuns exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getPipelineRuns');
  }

  return readJsonFile<PipelineRun[]>(RUNS_FILE, []);
}

export async function getPipelineRun(id: string): Promise<PipelineRun | null> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data as PipelineRun;
      if (!error) return null;
      console.warn('[pipeline-storage] Supabase getPipelineRun failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase getPipelineRun exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getPipelineRun');
  }

  const runs = await getPipelineRuns();
  return runs.find(r => r.id === id) ?? null;
}

export async function getLatestPipelineRun(): Promise<PipelineRun | null> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select('*')
        .order('startedAt', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) return data as PipelineRun;
      if (!error) return null;
      console.warn('[pipeline-storage] Supabase getLatestPipelineRun failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase getLatestPipelineRun exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getLatestPipelineRun');
  }

  const runs = await getPipelineRuns();
  if (runs.length === 0) return null;
  return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
}

export async function savePipelineRun(run: PipelineRun) {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('pipeline_runs')
        .upsert(run);
      if (!error) return;
      console.warn('[pipeline-storage] Supabase savePipelineRun failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase savePipelineRun exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for savePipelineRun');
  }

  const runs = await readJsonFile<PipelineRun[]>(RUNS_FILE, []);
  const idx = runs.findIndex(r => r.id === run.id);
  if (idx >= 0) {
    runs[idx] = run;
  } else {
    runs.push(run);
  }
  await writeJsonWithDir(RUNS_FILE, runs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip null bytes and other unsupported Unicode escape sequences
 * that PostgreSQL rejects in text/jsonb columns.
 */
function sanitizeForPostgres<T>(obj: T): T {
  const json = JSON.stringify(obj);
  // Remove \u0000 (null byte) which Postgres doesn't support
  const cleaned = json.replace(/\\u0000/g, '');
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Research Findings
// ---------------------------------------------------------------------------

export async function getFindings(pipelineRunId?: string): Promise<ResearchFinding[]> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      let query = supabase.from('research_findings').select('*');
      if (pipelineRunId) {
        query = query.eq('pipelineRunId', pipelineRunId);
      }
      const { data, error } = await query;
      if (!error && data) return data as ResearchFinding[];
      console.warn('[pipeline-storage] Supabase getFindings failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase getFindings exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getFindings');
  }

  const findings = await readJsonFile<ResearchFinding[]>(FINDINGS_FILE, []);
  if (pipelineRunId) {
    return findings.filter(f => f.pipelineRunId === pipelineRunId);
  }
  return findings;
}

export async function getFinding(id: string): Promise<ResearchFinding | null> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('research_findings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data as ResearchFinding;
      if (!error) return null;
      console.warn('[pipeline-storage] Supabase getFinding failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase getFinding exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getFinding');
  }

  const findings = await readJsonFile<ResearchFinding[]>(FINDINGS_FILE, []);
  return findings.find(f => f.id === id) ?? null;
}

export async function saveFindings(newFindings: ResearchFinding[]) {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const sanitized = sanitizeForPostgres(newFindings);
      const { error } = await supabase
        .from('research_findings')
        .upsert(sanitized);
      if (!error) return;
      console.warn('[pipeline-storage] Supabase saveFindings failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase saveFindings exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for saveFindings');
  }

  const existing = await readJsonFile<ResearchFinding[]>(FINDINGS_FILE, []);
  for (const finding of newFindings) {
    const idx = existing.findIndex(f => f.id === finding.id);
    if (idx >= 0) {
      existing[idx] = finding;
    } else {
      existing.push(finding);
    }
  }
  await writeJsonWithDir(FINDINGS_FILE, existing);
}

export async function updateFindingStatus(id: string, status: ResearchFinding['status']) {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('research_findings')
        .update({ status })
        .eq('id', id);
      if (!error) return;
      console.warn('[pipeline-storage] Supabase updateFindingStatus failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase updateFindingStatus exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for updateFindingStatus');
  }

  const findings = await readJsonFile<ResearchFinding[]>(FINDINGS_FILE, []);
  const idx = findings.findIndex(f => f.id === id);
  if (idx >= 0) {
    findings[idx].status = status;
    await writeJsonWithDir(FINDINGS_FILE, findings);
  }
}

// ---------------------------------------------------------------------------
// Verification Results
// ---------------------------------------------------------------------------

export async function getVerifications(pipelineRunId?: string): Promise<VerificationResult[]> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      let query = supabase.from('verification_results').select('*');
      if (pipelineRunId) {
        query = query.eq('pipelineRunId', pipelineRunId);
      }
      const { data, error } = await query;
      if (!error && data) return data as VerificationResult[];
      console.warn('[pipeline-storage] Supabase getVerifications failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase getVerifications exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getVerifications');
  }

  const results = await readJsonFile<VerificationResult[]>(VERIFICATIONS_FILE, []);
  if (pipelineRunId) {
    return results.filter(v => v.pipelineRunId === pipelineRunId);
  }
  return results;
}

export async function saveVerifications(newResults: VerificationResult[]) {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase
        .from('verification_results')
        .upsert(newResults);
      if (!error) return;
      console.warn('[pipeline-storage] Supabase saveVerifications failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[pipeline-storage] Supabase saveVerifications exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[pipeline-storage] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for saveVerifications');
  }

  const existing = await readJsonFile<VerificationResult[]>(VERIFICATIONS_FILE, []);
  for (const result of newResults) {
    const idx = existing.findIndex(v => v.id === result.id);
    if (idx >= 0) {
      existing[idx] = result;
    } else {
      existing.push(result);
    }
  }
  await writeJsonWithDir(VERIFICATIONS_FILE, existing);
}
