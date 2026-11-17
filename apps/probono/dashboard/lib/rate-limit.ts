import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export interface RateLimitConfig {
  bucket: string;
  binding: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  publicApi: { bucket: 'public-api', binding: 'RATE_LIMIT_PUBLIC_API', limit: 60, windowSeconds: 60 },
  mcp: { bucket: 'mcp', binding: 'RATE_LIMIT_MCP', limit: 60, windowSeconds: 60 },
  search: { bucket: 'search', binding: 'RATE_LIMIT_SEARCH', limit: 30, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const windows = new Map<string, { count: number; resetAt: number }>();

function workerBinding(name: string): RateLimitBinding | undefined {
  try {
    const binding = (getCloudflareContext().env as Record<string, unknown>)[name] as RateLimitBinding | undefined;
    return typeof binding?.limit === 'function' ? binding : undefined;
  } catch {
    return undefined;
  }
}

function retryAfterInMemory(key: string, config: RateLimitConfig): number | null {
  const now = Date.now();
  for (const [stored, window] of windows) {
    if (now > window.resetAt) windows.delete(stored);
  }
  const window = windows.get(key);
  if (!window) {
    windows.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return null;
  }
  window.count += 1;
  return window.count <= config.limit ? null : Math.ceil((window.resetAt - now) / 1000);
}

export async function rateLimitRetryAfter(headers: Headers, config: RateLimitConfig): Promise<number | null> {
  const ip = headers.get('cf-connecting-ip')?.trim() || 'unknown';
  const key = `${config.bucket}:${ip}`;
  const binding = workerBinding(config.binding);
  if (!binding) return retryAfterInMemory(key, config);
  const { success } = await binding.limit({ key });
  return success ? null : config.windowSeconds;
}

export async function checkRateLimit(request: Request, config: RateLimitConfig): Promise<NextResponse | null> {
  const retryAfter = await rateLimitRetryAfter(request.headers, config);
  if (retryAfter === null) return null;
  return NextResponse.json(
    { error: 'Too many requests', success: false },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
