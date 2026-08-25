import type { Agency, Development, Policy, TimelineEvent } from "@/types";

interface ApiListResponse<T> {
  data: T[];
  total: number;
  success: boolean;
  error?: string;
}

interface ApiItemResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

interface PublicStatusResponse {
  lastCollectedAt: string | null;
  lastHealthyAt: string | null;
  lastReviewedAt: string | null;
  collection: {
    health: string;
    dueSourceCount: number;
    successfulSourceCount: number;
    failedSourceCount: number;
    successRate: number;
    automaticSourceCount: number;
    manualSourceCount: number;
    manualCurrentCount: number;
    manualUnavailableCount: number;
  };
  latestDevelopment: {
    id: string;
    title: string;
    url: string;
    detectedAt: string;
    verificationStatus: string;
  } | null;
  success: boolean;
}

export interface PublicClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

function apiBaseUrl(baseUrl?: string) {
  let url: URL;
  try {
    url = new URL(
      baseUrl ?? process.env.POLICAI_API_BASE_URL ?? "https://policai.org",
    );
  } catch {
    throw new Error("POLICAI_API_BASE_URL must be a valid absolute URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("POLICAI_API_BASE_URL must use HTTP or HTTPS.");
  }
  return url;
}

async function requestApi<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  options: PublicClientOptions,
): Promise<T> {
  const url = new URL(path, apiBaseUrl(options.baseUrl));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "")
      url.searchParams.set(key, String(value));
  }

  const response = await (options.fetch ?? fetch)(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  let body: T & { error?: string; success?: boolean };
  try {
    body = (await response.json()) as T & { error?: string; success?: boolean };
  } catch {
    throw new Error(
      `Policai API returned invalid JSON (HTTP ${response.status}).`,
    );
  }
  if (!response.ok || body.success === false) {
    throw new Error(
      body.error || `Policai API returned HTTP ${response.status}.`,
    );
  }
  return body;
}

export async function handleSearchPolicies(
  input: {
    query?: string;
    jurisdiction?: string;
    type?: string;
    status?: string;
    limit?: number;
  },
  options: PublicClientOptions = {},
) {
  const response = await requestApi<ApiListResponse<Policy>>(
    "/api/policies",
    {
      search: input.query,
      jurisdiction: input.jurisdiction,
      type: input.type,
      status: input.status,
    },
    options,
  );
  const limit = input.limit ?? 20;
  return {
    total: response.total,
    count: Math.min(response.data.length, limit),
    policies: response.data.slice(0, limit).map((policy) => ({
      id: policy.id,
      title: policy.title,
      description: policy.description,
      jurisdiction: policy.jurisdiction,
      type: policy.type,
      status: policy.status,
      effectiveDate: policy.effectiveDate,
      agencies: policy.agencies,
      sourceUrl: policy.sourceUrl,
      aiSummary: policy.aiSummary,
      tags: policy.tags,
      updatedAt: policy.updatedAt,
      lastReviewedAt: policy.lastReviewedAt,
      verificationStatus: policy.verification.status,
    })),
  };
}

export async function handleGetPolicy(
  input: { id: string },
  options: PublicClientOptions = {},
) {
  const response = await requestApi<ApiItemResponse<Policy>>(
    `/api/policies/${encodeURIComponent(input.id)}`,
    {},
    options,
  );
  return response.data;
}

export async function handleSearchDevelopments(
  input: {
    query?: string;
    jurisdiction?: string;
    status?: string;
    since?: string;
    limit?: number;
  },
  options: PublicClientOptions = {},
) {
  const response = await requestApi<ApiListResponse<Development>>(
    "/api/developments",
    {
      search: input.query,
      jurisdiction: input.jurisdiction,
      status: input.status,
      since: input.since,
      limit: input.limit ?? 20,
    },
    options,
  );
  return {
    total: response.total,
    developments: response.data.map((development) => ({
      id: development.id,
      title: development.title,
      summary: development.summary,
      jurisdiction: development.jurisdiction,
      publishedAt: development.publishedAt,
      detectedAt: development.detectedAt,
      relevanceScore: development.relevanceScore,
      classification: development.classification,
      status: development.status,
      url: development.url,
      verificationStatus: development.verification.status,
      relatedPolicyId: development.relatedPolicyId,
      relatedTimelineEventId: development.relatedTimelineEventId,
    })),
  };
}

export async function handleListTimeline(
  input: { jurisdiction?: string; limit?: number },
  options: PublicClientOptions = {},
) {
  const response = await requestApi<ApiListResponse<TimelineEvent>>(
    "/api/timeline",
    {
      jurisdiction: input.jurisdiction,
    },
    options,
  );
  const limit = input.limit ?? 20;
  return {
    total: response.total,
    count: Math.min(response.data.length, limit),
    events: response.data.slice(0, limit).map((event) => ({
      id: event.id,
      date: event.date,
      datePrecision: event.datePrecision,
      title: event.title,
      description: event.description,
      type: event.type,
      jurisdiction: event.jurisdiction,
      relatedPolicyId: event.relatedPolicyId,
      sourceUrl: event.sourceUrl,
      verificationStatus: event.verification.status,
    })),
  };
}

export async function handleListAgencies(
  input: {
    level?: string;
    jurisdiction?: string;
    commonwealth?: boolean;
    limit?: number;
  },
  options: PublicClientOptions = {},
) {
  const response = await requestApi<ApiListResponse<Agency>>(
    "/api/agencies",
    {
      level: input.level,
      jurisdiction: input.jurisdiction,
      commonwealth: input.commonwealth,
    },
    options,
  );
  const limit = input.limit ?? 50;
  return {
    total: response.total,
    count: Math.min(response.data.length, limit),
    agencies: response.data.slice(0, limit).map((agency) => ({
      id: agency.id,
      name: agency.name,
      acronym: agency.acronym,
      level: agency.level,
      jurisdiction: agency.jurisdiction,
      website: agency.website,
      hasPublishedStatement: agency.hasPublishedStatement,
      transparencyStatementUrl: agency.transparencyStatementUrl,
      lastUpdated: agency.lastUpdated,
      verificationStatus: agency.verification.status,
    })),
  };
}

export function handleGetStatus(options: PublicClientOptions = {}) {
  return requestApi<PublicStatusResponse>("/api/status", {}, options);
}

export function toPublicToolText<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
