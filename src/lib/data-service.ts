/**
 * Data Service — unified abstraction over Supabase (primary) and JSON files (fallback).
 *
 * Every public function first checks whether Supabase is configured. If it is,
 * the query goes to Supabase. If not (or if the query fails), it transparently
 * falls back to the static JSON files in `public/data/`.
 *
 * This lets the site work on Vercel with a live database *and* locally with
 * zero external dependencies.
 */

import path from 'path';
import { readJsonFile, writeJsonFile } from '@/lib/file-store';
import type { Policy, Agency, TimelineEvent, ScraperRunLog } from '@/types';

// ---------------------------------------------------------------------------
// Supabase availability
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/** True when the env vars are set and non-empty. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Lazily import the Supabase client so the JSON-only path never triggers
 * `createClient` with placeholder credentials.
 */
async function getSupabase() {
  const { supabase } = await import('@/lib/supabase');
  return supabase;
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const POLICIES_FILE = path.join(process.cwd(), 'public', 'data', 'sample-policies.json');
const AGENCIES_FILE = path.join(process.cwd(), 'public', 'data', 'sample-agencies.json');
const COMMONWEALTH_AGENCIES_FILE = path.join(process.cwd(), 'public', 'data', 'commonwealth-agencies.json');
const TIMELINE_FILE = path.join(process.cwd(), 'public', 'data', 'sample-timeline.json');

// ---------------------------------------------------------------------------
// Policy operations
// ---------------------------------------------------------------------------

export interface PolicyFilters {
  jurisdiction?: string;
  type?: string;
  status?: string;
  search?: string;
}

interface PolicyWithTrash extends Policy {
  trashedAt?: string;
}

export class DuplicatePolicyError extends Error {
  constructor(id: string) {
    super(`Policy already exists: ${id}`);
    this.name = 'DuplicatePolicyError';
  }
}

export async function getPolicies(filters?: PolicyFilters): Promise<Policy[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      let query = supabase.from('policies').select('*');

      if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
      if (filters?.type) query = query.eq('type', filters.type);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`,
        );
      }

      const { data, error } = await query.order('effectiveDate', { ascending: false });
      if (!error && data) return data as Policy[];
      console.warn('[data-service] Supabase getPolicies failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getPolicies exception, falling back to JSON:', err);
    }
  }

  // JSON fallback
  let policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);

  if (filters?.jurisdiction) {
    policies = policies.filter((p) => p.jurisdiction === filters.jurisdiction);
  }
  if (filters?.type) {
    policies = policies.filter((p) => p.type === filters.type);
  }
  if (filters?.status) {
    policies = policies.filter((p) => p.status === filters.status);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    policies = policies.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t: string) => t.toLowerCase().includes(q)),
    );
  }

  return policies.sort(
    (a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime(),
  );
}

export async function getPolicyById(id: string): Promise<Policy | null> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data as Policy;
      if (!error) return null;
      console.warn('[data-service] Supabase getPolicyById failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getPolicyById exception, falling back to JSON:', err);
    }
  }

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  return policies.find((p) => p.id === id) || null;
}

export async function createPolicy(policy: Policy): Promise<Policy> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('policies')
        .insert(policy)
        .select()
        .single();
      if (!error && data) return data as Policy;
      console.warn('[data-service] Supabase createPolicy failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase createPolicy exception, falling back to JSON:', err);
    }
  }

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  if (policies.some((existingPolicy) => existingPolicy.id === policy.id)) {
    throw new DuplicatePolicyError(policy.id);
  }
  policies.unshift(policy);
  await writeJsonFile(POLICIES_FILE, policies);
  return policy;
}

export async function updatePolicy(
  id: string,
  updates: Partial<PolicyWithTrash>,
): Promise<Policy | null> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('policies')
        .update({ ...updates, updatedAt: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return data as Policy;
      console.warn('[data-service] Supabase updatePolicy failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase updatePolicy exception, falling back to JSON:', err);
    }
  }

  const policies = await readJsonFile<PolicyWithTrash[]>(POLICIES_FILE, []);
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  if (updates.status === 'trashed' && policies[idx].status !== 'trashed') {
    policies[idx].trashedAt = now;
  } else if (updates.status && updates.status !== 'trashed' && policies[idx].status === 'trashed') {
    delete policies[idx].trashedAt;
  }

  policies[idx] = { ...policies[idx], ...updates, updatedAt: now };
  await writeJsonFile(POLICIES_FILE, policies);
  return policies[idx];
}

export async function deletePolicy(id: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from('policies').delete().eq('id', id);
      if (!error) return true;
      console.warn('[data-service] Supabase deletePolicy failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase deletePolicy exception, falling back to JSON:', err);
    }
  }

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  const idx = policies.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  policies.splice(idx, 1);
  await writeJsonFile(POLICIES_FILE, policies);
  return true;
}

/** Check if a policy with a given ID already exists. */
export async function policyExists(id: string): Promise<boolean> {
  const policy = await getPolicyById(id);
  return policy !== null;
}

// ---------------------------------------------------------------------------
// Agency operations
// ---------------------------------------------------------------------------

export async function getAgencies(filters?: {
  level?: string;
  jurisdiction?: string;
}): Promise<Agency[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      let query = supabase.from('agencies').select('*');
      if (filters?.level) query = query.eq('level', filters.level);
      if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
      const { data, error } = await query.order('name');
      if (!error && data) return data as Agency[];
      console.warn('[data-service] Supabase getAgencies failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getAgencies exception, falling back to JSON:', err);
    }
  }

  let agencies = await readJsonFile<Agency[]>(AGENCIES_FILE, []);
  if (filters?.level) {
    agencies = agencies.filter((a) => a.level === filters.level);
  }
  if (filters?.jurisdiction) {
    agencies = agencies.filter((a) => a.jurisdiction === filters.jurisdiction);
  }
  return agencies.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCommonwealthAgencies(): Promise<Agency[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .eq('level', 'federal')
        .order('name');
      if (!error && data) return data as Agency[];
    } catch {
      // fall through
    }
  }

  return readJsonFile<Agency[]>(COMMONWEALTH_AGENCIES_FILE, []);
}

// ---------------------------------------------------------------------------
// Timeline operations
// ---------------------------------------------------------------------------

export async function getTimelineEvents(filters?: {
  jurisdiction?: string;
}): Promise<TimelineEvent[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      let query = supabase.from('timeline_events').select('*');
      if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
      const { data, error } = await query.order('date', { ascending: true });
      if (!error && data) return data as TimelineEvent[];
    } catch {
      // fall through
    }
  }

  let events = await readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
  if (filters?.jurisdiction) {
    events = events.filter((e) => e.jurisdiction === filters.jurisdiction);
  }
  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// ---------------------------------------------------------------------------
// Scraper run logging
// ---------------------------------------------------------------------------

const SCRAPER_RUNS_FILE = path.join(process.cwd(), 'public', 'data', 'scraper-runs.json');

export async function logScraperRun(run: ScraperRunLog): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.from('scraper_runs').insert(run);
      if (!error) return;
      console.warn('[data-service] Supabase logScraperRun failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase logScraperRun exception, falling back to JSON:', err);
    }
  }

  const runs = await readJsonFile<ScraperRunLog[]>(SCRAPER_RUNS_FILE, []);
  runs.unshift(run);
  // Keep only the last 100 runs in JSON to prevent unbounded growth
  await writeJsonFile(SCRAPER_RUNS_FILE, runs.slice(0, 100));
}

export async function getRecentScraperRuns(limit = 20): Promise<ScraperRunLog[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('scraper_runs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      if (!error && data) return data as ScraperRunLog[];
      console.warn('[data-service] Supabase getRecentScraperRuns failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getRecentScraperRuns exception, falling back to JSON:', err);
    }
  }

  const runs = await readJsonFile<ScraperRunLog[]>(SCRAPER_RUNS_FILE, []);
  return runs.slice(0, limit);
}
