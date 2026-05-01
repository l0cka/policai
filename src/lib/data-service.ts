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
import type {
  Policy,
  Agency,
  TimelineEvent,
  ScraperRunLog,
  SourceReview,
  SourceReviewStatus,
  McpAuditLog,
} from '@/types';

// ---------------------------------------------------------------------------
// Supabase availability
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** True when the env vars are set and non-empty. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);

/**
 * Lazily import the Supabase client so the JSON-only path never triggers
 * `createClient` with placeholder credentials.
 */
async function getSupabase() {
  const { supabase } = await import('@/lib/supabase');
  return supabase;
}

async function getSupabaseAdmin() {
  const { createSupabaseAdminClient } = await import('@/lib/supabase-admin');
  return createSupabaseAdminClient();
}

type DataAccess = 'public' | 'admin';

interface DataServiceOptions {
  access?: DataAccess;
}

const PUBLIC_POLICY_STATUSES = new Set(['proposed', 'active', 'amended', 'repealed']);

function isPublicPolicy(policy: Policy): boolean {
  return PUBLIC_POLICY_STATUSES.has(policy.status);
}

function applyPublicPolicyFilter(policies: Policy[]): Policy[] {
  return policies.filter(isPublicPolicy);
}

function toPublicAgencies(agencies: Agency[]): Agency[] {
  return agencies.map((agency) => ({
    id: agency.id,
    name: agency.name,
    acronym: agency.acronym,
    level: agency.level,
    jurisdiction: agency.jurisdiction,
    aiTransparencyStatement: agency.aiTransparencyStatement,
    aiUsageDisclosure: agency.aiUsageDisclosure,
    website: agency.website,
    policies: agency.policies,
    transparencyStatementUrl: agency.transparencyStatementUrl,
    lastUpdated: agency.lastUpdated,
    hasPublishedStatement: agency.hasPublishedStatement,
  }));
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize search input for PostgREST filters.
 * Strips characters that could be used for filter injection (commas, dots,
 * parentheses, and PostgREST operators).
 */
function sanitizeSearchInput(input: string): string {
  return input
    .replace(/[,().]/g, '') // PostgREST filter delimiters
    .replace(/\\/g, '')     // escape characters
    .slice(0, 200);         // cap length
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const POLICIES_FILE = path.join(process.cwd(), 'public', 'data', 'sample-policies.json');
const AGENCIES_FILE = path.join(process.cwd(), 'public', 'data', 'sample-agencies.json');
const COMMONWEALTH_AGENCIES_FILE = path.join(process.cwd(), 'public', 'data', 'commonwealth-agencies.json');
const TIMELINE_FILE = path.join(process.cwd(), 'public', 'data', 'sample-timeline.json');
const SOURCE_REVIEWS_FILE = path.join(process.cwd(), 'data', 'source-reviews.json');
const LEGACY_PENDING_CONTENT_FILE = path.join(process.cwd(), 'public', 'data', 'pending-content.json');
const MCP_AUDIT_LOG_FILE = path.join(process.cwd(), 'data', 'mcp-audit-log.json');

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

export async function getPolicies(
  filters?: PolicyFilters,
  options: DataServiceOptions = {},
): Promise<Policy[]> {
  const access = options.access ?? 'public';

  if (isSupabaseConfigured) {
    try {
      const supabase = access === 'admin' && isSupabaseAdminConfigured
        ? await getSupabaseAdmin()
        : await getSupabase();
      let query = supabase.from('policies').select('*');

      if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
      if (filters?.type) query = query.eq('type', filters.type);
      if (filters?.status) query = query.eq('status', filters.status);
      if (access === 'public') {
        query = query.in('status', Array.from(PUBLIC_POLICY_STATUSES));
      }
      if (filters?.search) {
        const sanitized = sanitizeSearchInput(filters.search);
        query = query.or(
          `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`,
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
  if (access === 'public') {
    policies = applyPublicPolicyFilter(policies);
  }

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

export async function getPolicyById(
  id: string,
  options: DataServiceOptions = {},
): Promise<Policy | null> {
  const access = options.access ?? 'public';

  if (isSupabaseConfigured) {
    try {
      const supabase = access === 'admin' && isSupabaseAdminConfigured
        ? await getSupabaseAdmin()
        : await getSupabase();
      let query = supabase
        .from('policies')
        .select('*')
        .eq('id', id);
      if (access === 'public') {
        query = query.in('status', Array.from(PUBLIC_POLICY_STATUSES));
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) return data as Policy;
      if (!error) return null;
      console.warn('[data-service] Supabase getPolicyById failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getPolicyById exception, falling back to JSON:', err);
    }
  }

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  const policy = policies.find((p) => p.id === id) || null;
  if (policy && access === 'public' && !isPublicPolicy(policy)) return null;
  return policy;
}

export async function getPolicyBySourceUrl(
  sourceUrl: string,
  options: DataServiceOptions = {},
): Promise<Policy | null> {
  const access = options.access ?? 'public';

  if (isSupabaseConfigured) {
    try {
      const supabase = access === 'admin' && isSupabaseAdminConfigured
        ? await getSupabaseAdmin()
        : await getSupabase();
      let query = supabase
        .from('policies')
        .select('*')
        .eq('sourceUrl', sourceUrl);
      if (access === 'public') {
        query = query.in('status', Array.from(PUBLIC_POLICY_STATUSES));
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) return data as Policy;
      if (!error) return null;
      console.warn('[data-service] Supabase getPolicyBySourceUrl failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getPolicyBySourceUrl exception, falling back to JSON:', err);
    }
  }

  const policies = await readJsonFile<Policy[]>(POLICIES_FILE, []);
  const policy = policies.find((p) => p.sourceUrl === sourceUrl) || null;
  if (policy && access === 'public' && !isPublicPolicy(policy)) return null;
  return policy;
}

function isSupabaseDuplicateError(message?: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('duplicate key') || normalized.includes('unique constraint');
}

export async function createPolicy(policy: Policy): Promise<Policy> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { data, error } = await supabase
        .from('policies')
        .insert(policy)
        .select()
        .single();
      if (!error && data) return data as Policy;
      if (isSupabaseDuplicateError(error?.message)) {
        throw new DuplicatePolicyError(policy.id);
      }
      console.warn('[data-service] Supabase createPolicy failed, falling back to JSON:', error?.message);
    } catch (err) {
      if (err instanceof DuplicatePolicyError) {
        throw err;
      }
      console.warn('[data-service] Supabase createPolicy exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for createPolicy');
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
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
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
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for updatePolicy');
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
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { error } = await supabase.from('policies').delete().eq('id', id);
      if (!error) return true;
      console.warn('[data-service] Supabase deletePolicy failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase deletePolicy exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for deletePolicy');
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
  const policy = await getPolicyById(id, { access: 'admin' });
  return policy !== null;
}

export async function policyExistsBySourceUrl(sourceUrl: string): Promise<boolean> {
  const policy = await getPolicyBySourceUrl(sourceUrl, { access: 'admin' });
  return policy !== null;
}

// ---------------------------------------------------------------------------
// Source review operations
// ---------------------------------------------------------------------------

interface LegacyPendingItem {
  id: string;
  title: string;
  source: string;
  discoveredAt: string;
  status: 'pending_review' | 'approved' | 'rejected';
  aiAnalysis: SourceReview['analysis'];
}

function createPolicyFromReview(item: LegacyPendingItem): Policy {
  const now = new Date().toISOString();
  const id = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);

  return {
    id,
    title: item.title,
    description: item.aiAnalysis.summary,
    jurisdiction: (item.aiAnalysis.suggestedJurisdiction as Policy['jurisdiction']) || 'federal',
    type: (item.aiAnalysis.suggestedType as Policy['type']) || 'guideline',
    status: 'active',
    effectiveDate: item.discoveredAt.split('T')[0] || now.split('T')[0],
    agencies: item.aiAnalysis.agencies || [],
    sourceUrl: item.source,
    content: item.aiAnalysis.summary,
    aiSummary: item.aiAnalysis.summary,
    tags: item.aiAnalysis.tags || [],
    createdAt: now,
    updatedAt: now,
  };
}

function legacyPendingToSourceReview(item: LegacyPendingItem): SourceReview {
  return {
    id: item.id,
    sourceUrl: item.source,
    title: item.title,
    entryKind: 'policy',
    status: item.status,
    discoveredAt: item.discoveredAt,
    createdBy: 'legacy-admin-review',
    analysis: item.aiAnalysis,
    proposedRecord: createPolicyFromReview(item),
    updatedAt: item.discoveredAt,
  };
}

async function readSourceReviewsFromJson(): Promise<SourceReview[]> {
  const reviews = await readJsonFile<SourceReview[]>(SOURCE_REVIEWS_FILE, []);
  if (reviews.length > 0) return reviews;

  const legacyItems = await readJsonFile<LegacyPendingItem[]>(LEGACY_PENDING_CONTENT_FILE, []);
  return legacyItems.map(legacyPendingToSourceReview);
}

export async function getSourceReviews(filters?: {
  status?: SourceReviewStatus;
}): Promise<SourceReview[]> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      let query = supabase.from('source_reviews').select('*');
      if (filters?.status) query = query.eq('status', filters.status);
      const { data, error } = await query.order('discoveredAt', { ascending: false });
      if (!error && data) return data as SourceReview[];
      console.warn('[data-service] Supabase getSourceReviews failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getSourceReviews exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getSourceReviews');
  }

  let reviews = await readSourceReviewsFromJson();
  if (filters?.status) {
    reviews = reviews.filter((review) => review.status === filters.status);
  }
  return reviews.sort(
    (a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime(),
  );
}

export async function getSourceReviewById(id: string): Promise<SourceReview | null> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { data, error } = await supabase
        .from('source_reviews')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data as SourceReview;
      if (!error) return null;
      console.warn('[data-service] Supabase getSourceReviewById failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getSourceReviewById exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getSourceReviewById');
  }

  const reviews = await readSourceReviewsFromJson();
  return reviews.find((review) => review.id === id) || null;
}

export async function createSourceReview(review: SourceReview): Promise<SourceReview> {
  if (await sourceUrlExists(review.sourceUrl)) {
    throw new DuplicatePolicyError(review.sourceUrl);
  }

  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { data, error } = await supabase
        .from('source_reviews')
        .insert(review)
        .select()
        .single();
      if (!error && data) return data as SourceReview;
      if (isSupabaseDuplicateError(error?.message)) {
        throw new DuplicatePolicyError(review.sourceUrl);
      }
      console.warn('[data-service] Supabase createSourceReview failed, falling back to JSON:', error?.message);
    } catch (err) {
      if (err instanceof DuplicatePolicyError) {
        throw err;
      }
      console.warn('[data-service] Supabase createSourceReview exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for createSourceReview');
  }

  const reviews = await readSourceReviewsFromJson();
  if (reviews.some((existing) => existing.id === review.id || existing.sourceUrl === review.sourceUrl)) {
    throw new DuplicatePolicyError(review.sourceUrl);
  }
  reviews.unshift(review);
  await writeJsonFile(SOURCE_REVIEWS_FILE, reviews);
  return review;
}

export async function updateSourceReview(
  id: string,
  updates: Partial<SourceReview>,
): Promise<SourceReview | null> {
  const nextUpdates = { ...updates, updatedAt: new Date().toISOString() };

  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { data, error } = await supabase
        .from('source_reviews')
        .update(nextUpdates)
        .eq('id', id)
        .select()
        .single();
      if (!error && data) return data as SourceReview;
      console.warn('[data-service] Supabase updateSourceReview failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase updateSourceReview exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for updateSourceReview');
  }

  const reviews = await readSourceReviewsFromJson();
  const idx = reviews.findIndex((review) => review.id === id);
  if (idx === -1) return null;
  reviews[idx] = { ...reviews[idx], ...nextUpdates };
  await writeJsonFile(SOURCE_REVIEWS_FILE, reviews);
  return reviews[idx];
}

export async function deleteSourceReview(id: string): Promise<boolean> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { error } = await supabase.from('source_reviews').delete().eq('id', id);
      if (!error) return true;
      console.warn('[data-service] Supabase deleteSourceReview failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase deleteSourceReview exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for deleteSourceReview');
  }

  const reviews = await readSourceReviewsFromJson();
  const filtered = reviews.filter((review) => review.id !== id);
  if (filtered.length === reviews.length) return false;
  await writeJsonFile(SOURCE_REVIEWS_FILE, filtered);
  return true;
}

export async function sourceUrlExists(
  sourceUrl: string,
  options: {
    excludeSourceReviewId?: string;
  } = {},
): Promise<boolean> {
  if (await policyExistsBySourceUrl(sourceUrl)) return true;

  const timelineEvents = await getTimelineEvents(undefined, { includeGenerated: false });
  if (timelineEvents.some((event) => event.sourceUrl === sourceUrl)) return true;

  const sourceReviews = await getSourceReviews();
  return sourceReviews.some(
    (review) =>
      review.sourceUrl === sourceUrl &&
      review.id !== options.excludeSourceReviewId &&
      review.status !== 'rejected',
  );
}

// ---------------------------------------------------------------------------
// Agency operations
// ---------------------------------------------------------------------------

export async function getAgencies(
  filters?: {
    level?: string;
    jurisdiction?: string;
  },
  options: DataServiceOptions = {},
): Promise<Agency[]> {
  const access = options.access ?? 'public';

  if (isSupabaseConfigured) {
    try {
      const supabase = isSupabaseAdminConfigured ? await getSupabaseAdmin() : await getSupabase();
      let query = supabase.from('agencies').select('*');
      if (filters?.level) query = query.eq('level', filters.level);
      if (filters?.jurisdiction) query = query.eq('jurisdiction', filters.jurisdiction);
      const { data, error } = await query.order('name');
      if (!error && data) {
        const agencies = data as Agency[];
        return access === 'admin' ? agencies : toPublicAgencies(agencies);
      }
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
  const sorted = agencies.sort((a, b) => a.name.localeCompare(b.name));
  return access === 'admin' ? sorted : toPublicAgencies(sorted);
}

export async function getCommonwealthAgencies(
  options: DataServiceOptions = {},
): Promise<Agency[]> {
  const access = options.access ?? 'public';

  if (isSupabaseConfigured) {
    try {
      const supabase = isSupabaseAdminConfigured ? await getSupabaseAdmin() : await getSupabase();
      const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .eq('level', 'federal')
        .order('name');
      if (!error && data) {
        const agencies = data as Agency[];
        return access === 'admin' ? agencies : toPublicAgencies(agencies);
      }
    } catch {
      // fall through
    }
  }

  const agencies = await readJsonFile<Agency[]>(COMMONWEALTH_AGENCIES_FILE, []);
  return access === 'admin' ? agencies : toPublicAgencies(agencies);
}

// ---------------------------------------------------------------------------
// Timeline operations
// ---------------------------------------------------------------------------

async function getManualTimelineEvents(): Promise<TimelineEvent[]> {
  if (isSupabaseConfigured) {
    try {
      const supabase = isSupabaseAdminConfigured ? await getSupabaseAdmin() : await getSupabase();
      const { data, error } = await supabase
        .from('timeline_events')
        .select('*')
        .order('date', { ascending: true });
      if (!error && data) return data as TimelineEvent[];
      console.warn('[data-service] Supabase getManualTimelineEvents failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase getManualTimelineEvents exception, falling back to JSON:', err);
    }
  }

  return readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
}

export async function createTimelineEvent(
  event: TimelineEvent,
  options: {
    excludeSourceReviewId?: string;
  } = {},
): Promise<TimelineEvent> {
  if (event.sourceUrl && (await sourceUrlExists(event.sourceUrl, options))) {
    throw new DuplicatePolicyError(event.sourceUrl);
  }

  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { data, error } = await supabase
        .from('timeline_events')
        .insert(event)
        .select()
        .single();
      if (!error && data) return data as TimelineEvent;
      if (isSupabaseDuplicateError(error?.message)) {
        throw new DuplicatePolicyError(event.id);
      }
      console.warn('[data-service] Supabase createTimelineEvent failed, falling back to JSON:', error?.message);
    } catch (err) {
      if (err instanceof DuplicatePolicyError) {
        throw err;
      }
      console.warn('[data-service] Supabase createTimelineEvent exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for createTimelineEvent');
  }

  const events = await readJsonFile<TimelineEvent[]>(TIMELINE_FILE, []);
  if (events.some((existing) => existing.id === event.id || (event.sourceUrl && existing.sourceUrl === event.sourceUrl))) {
    throw new DuplicatePolicyError(event.id);
  }
  events.push(event);
  await writeJsonFile(TIMELINE_FILE, events);
  return event;
}

export async function getTimelineEvents(
  filters?: {
    jurisdiction?: string;
  },
  options: {
    includeGenerated?: boolean;
  } = {},
): Promise<TimelineEvent[]> {
  const includeGenerated = options.includeGenerated ?? true;
  // Generate timeline events from policies + merge with manual curated events
  const policies = includeGenerated ? await getPolicies() : [];
  const manualEvents = await getManualTimelineEvents();

  // Build a set of relatedPolicyIds from manual events for dedup
  const manualPolicyIds = new Set(
    manualEvents.filter((e) => e.relatedPolicyId).map((e) => e.relatedPolicyId),
  );

  // Generate timeline events from policies (skip if manual event already covers it)
  const policyEvents: TimelineEvent[] = policies
    .filter((p) => p.effectiveDate && !manualPolicyIds.has(p.id))
    .map((p) => ({
      id: `policy-timeline-${p.id}`,
      date: typeof p.effectiveDate === 'string' ? p.effectiveDate : new Date(p.effectiveDate).toISOString().split('T')[0],
      title: p.title,
      description: p.description.length > 200 ? p.description.slice(0, 197) + '...' : p.description,
      type: p.status === 'amended' ? 'policy_amended' as const : 'policy_introduced' as const,
      jurisdiction: p.jurisdiction,
      relatedPolicyId: p.id,
      sourceUrl: p.sourceUrl,
    }));

  let events = [...manualEvents, ...policyEvents];

  if (filters?.jurisdiction) {
    events = events.filter((e) => e.jurisdiction === filters.jurisdiction);
  }

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function logMcpAuditEvent(log: McpAuditLog): Promise<void> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { error } = await supabase.from('mcp_audit_log').insert(log);
      if (!error) return;
      console.warn('[data-service] Supabase logMcpAuditEvent failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase logMcpAuditEvent exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for logMcpAuditEvent');
  }

  const logs = await readJsonFile<McpAuditLog[]>(MCP_AUDIT_LOG_FILE, []);
  logs.unshift(log);
  await writeJsonFile(MCP_AUDIT_LOG_FILE, logs.slice(0, 500));
}

// ---------------------------------------------------------------------------
// Scraper run logging
// ---------------------------------------------------------------------------

const SCRAPER_RUNS_FILE = path.join(process.cwd(), 'data', 'scraper-runs.json');

export async function logScraperRun(run: ScraperRunLog): Promise<void> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
      const { error } = await supabase.from('scraper_runs').insert(run);
      if (!error) return;
      console.warn('[data-service] Supabase logScraperRun failed, falling back to JSON:', error?.message);
    } catch (err) {
      console.warn('[data-service] Supabase logScraperRun exception, falling back to JSON:', err);
    }
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for logScraperRun');
  }

  const runs = await readJsonFile<ScraperRunLog[]>(SCRAPER_RUNS_FILE, []);
  runs.unshift(run);
  // Keep only the last 100 runs in JSON to prevent unbounded growth
  await writeJsonFile(SCRAPER_RUNS_FILE, runs.slice(0, 100));
}

export async function getRecentScraperRuns(limit = 20): Promise<ScraperRunLog[]> {
  if (isSupabaseAdminConfigured) {
    try {
      const supabase = await getSupabaseAdmin();
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
  } else if (isSupabaseConfigured) {
    console.warn('[data-service] SUPABASE_SERVICE_ROLE_KEY is not configured; falling back to JSON for getRecentScraperRuns');
  }

  const runs = await readJsonFile<ScraperRunLog[]>(SCRAPER_RUNS_FILE, []);
  return runs.slice(0, limit);
}
