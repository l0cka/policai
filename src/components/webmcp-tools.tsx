'use client';

import { useEffect } from 'react';
import {
  JURISDICTIONS,
  POLICY_STATUSES,
  POLICY_TYPES,
  type Development,
  type Policy,
} from '@/types';

type ToolInput = Record<string, unknown>;
type ToolExecutionOptions = { signal?: AbortSignal };

interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: true;
    untrustedContentHint: true;
  };
  execute: (
    input: ToolInput,
    options?: ToolExecutionOptions,
  ) => Promise<unknown>;
}

export interface WebMcpModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

type ApiResponse<T> =
  | { data: T; success: true; total?: number }
  | { error: string; success: false };

type Fetch = typeof fetch;

const publicPolicyStatuses = POLICY_STATUSES.filter(
  (status) => status !== 'trashed',
);

async function fetchApi<T>(
  url: string,
  fetchImpl: Fetch,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const body = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    throw new Error(
      !body.success ? body.error : `Policai API request failed (${response.status})`,
    );
  }

  return body.data;
}

function assertAllowedKeys(
  input: ToolInput,
  allowedKeys: readonly string[],
) {
  const extraKey = Object.keys(input).find((key) => !allowedKeys.includes(key));
  if (extraKey) throw new TypeError(`Unsupported input: ${extraKey}`);
}

function optionalString(input: ToolInput, key: string, maxLength = Infinity) {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new TypeError(`${key} must be a string of at most ${maxLength} characters`);
  }
  return value || undefined;
}

function optionalEnum(
  input: ToolInput,
  key: string,
  values: readonly string[],
) {
  const value = optionalString(input, key);
  if (value && !values.includes(value)) {
    throw new TypeError(`${key} must be one of: ${values.join(', ')}`);
  }
  return value;
}

function optionalInteger(
  input: ToolInput,
  key: string,
  minimum: number,
  maximum: number,
) {
  const value = input[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new TypeError(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function createTools(fetchImpl: Fetch): WebMcpTool[] {
  return [
    {
      name: 'search_policies',
      title: 'Search Australian AI policies',
      description:
        'Search Policai\'s public register of editorially verified Australian AI policy records.',
      inputSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            maxLength: 200,
            description: 'Words to match in titles, descriptions or tags.',
          },
          jurisdiction: { type: 'string', enum: [...JURISDICTIONS] },
          type: { type: 'string', enum: [...POLICY_TYPES] },
          status: { type: 'string', enum: publicPolicyStatuses },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        assertAllowedKeys(input, [
          'search',
          'jurisdiction',
          'type',
          'status',
          'limit',
        ]);
        const params = new URLSearchParams();
        const filters = {
          search: optionalString(input, 'search', 200),
          jurisdiction: optionalEnum(input, 'jurisdiction', JURISDICTIONS),
          type: optionalEnum(input, 'type', POLICY_TYPES),
          status: optionalEnum(input, 'status', publicPolicyStatuses),
        };
        for (const [key, value] of Object.entries(filters)) {
          if (value) params.set(key, value);
        }
        const limit = optionalInteger(input, 'limit', 1, 50) ?? 20;

        const query = params.size ? `?${params}` : '';
        const policies = await fetchApi<Policy[]>(
          `/api/policies${query}`,
          fetchImpl,
          options?.signal,
        );
        const results = policies.slice(0, limit);

        return {
          total: results.length,
          available: policies.length,
          policies: results.map((policy) => ({
            id: policy.id,
            title: policy.title,
            description: policy.description,
            jurisdiction: policy.jurisdiction,
            type: policy.type,
            status: policy.status,
            effectiveDate: policy.effectiveDate,
            agencies: policy.agencies,
            sourceUrl: policy.sourceUrl,
            lastReviewedAt: policy.lastReviewedAt,
          })),
        };
      },
    },
    {
      name: 'get_policy',
      title: 'Get an Australian AI policy',
      description:
        'Retrieve one editorially verified Policai policy record by its stable ID.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', minLength: 1, description: 'The Policai policy ID.' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        assertAllowedKeys(input, ['id']);
        if (typeof input.id !== 'string' || !input.id) {
          throw new TypeError('id must be a non-empty string');
        }

        return fetchApi<Policy>(
          `/api/policies/${encodeURIComponent(input.id)}`,
          fetchImpl,
          options?.signal,
        );
      },
    },
    {
      name: 'list_developments',
      title: 'List Australian AI policy developments',
      description:
        'List Policai radar detections. Results may need editorial review and each includes its verification status.',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', maxLength: 200 },
          jurisdiction: { type: 'string', enum: [...JURISDICTIONS] },
          status: { type: 'string', enum: ['detected', 'promoted'] },
          since: {
            type: 'string',
            format: 'date-time',
            description: 'Only return developments detected on or after this ISO 8601 timestamp.',
          },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        assertAllowedKeys(input, [
          'search',
          'jurisdiction',
          'status',
          'since',
          'limit',
        ]);
        const params = new URLSearchParams();
        const filters = {
          search: optionalString(input, 'search', 200),
          jurisdiction: optionalEnum(input, 'jurisdiction', JURISDICTIONS),
          status: optionalEnum(input, 'status', ['detected', 'promoted']),
          since: optionalString(input, 'since'),
        };
        if (filters.since && Number.isNaN(Date.parse(filters.since))) {
          throw new TypeError('since must be an ISO 8601 date or timestamp');
        }
        for (const [key, value] of Object.entries(filters)) {
          if (value) params.set(key, value);
        }
        params.set('limit', String(optionalInteger(input, 'limit', 1, 100) ?? 20));

        const developments = await fetchApi<Development[]>(
          `/api/developments?${params}`,
          fetchImpl,
          options?.signal,
        );
        return { total: developments.length, developments };
      },
    },
  ];
}

export async function registerPolicaiWebMcpTools(
  modelContext: WebMcpModelContext,
  fetchImpl: Fetch = fetch,
  signal?: AbortSignal,
) {
  await Promise.all(
    createTools(fetchImpl).map((tool) =>
      modelContext.registerTool(tool, { signal }),
    ),
  );
}

export function WebMcpTools() {
  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: WebMcpModelContext }
    ).modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    void registerPolicaiWebMcpTools(
      modelContext,
      window.fetch.bind(window),
      controller.signal,
    ).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.warn('Policai WebMCP tool registration failed', error);
      }
    });

    return () => controller.abort();
  }, []);

  return null;
}
