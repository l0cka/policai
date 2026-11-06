import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

/**
 * Per-client, per-bucket rate limiting. On Workers each bucket counts through
 * a rate limiting binding declared in wrangler.jsonc, so every isolate in a
 * Cloudflare location shares one count. Without the binding (next dev, tests,
 * self-hosted) it falls back to an in-memory fixed window, which only counts
 * within one process.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 60_000);

export interface RateLimitConfig {
  /** Routes sharing a bucket share one budget, whatever their path or ids */
  bucket: string;
  /** wrangler.jsonc `ratelimits` binding with the same limit and period */
  binding: string;
  /** Maximum requests per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/** Every bucket. wrangler.jsonc declares one binding per entry, same numbers. */
export const RATE_LIMITS = {
  publicApi: { bucket: 'public-api', binding: 'RATE_LIMIT_PUBLIC_API', limit: 60, windowSeconds: 60 },
  signalReviews: { bucket: 'signal-reviews', binding: 'RATE_LIMIT_SIGNAL_REVIEWS', limit: 20, windowSeconds: 60 },
  signalReview: { bucket: 'signal-review', binding: 'RATE_LIMIT_SIGNAL_REVIEW', limit: 30, windowSeconds: 60 },
  approvals: { bucket: 'approvals', binding: 'RATE_LIMIT_APPROVALS', limit: 10, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests', success: false },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    },
  );
}

async function workerBinding(name: string): Promise<RateLimitBinding | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as Record<string, unknown>)[name] as RateLimitBinding | undefined;
    return typeof binding?.limit === 'function' ? binding : undefined;
  } catch {
    return undefined;
  }
}

function checkInMemory(key: string, config: RateLimitConfig): NextResponse | null {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return null;
  }

  entry.count++;
  if (entry.count <= config.limit) return null;
  return tooManyRequests(Math.ceil((entry.resetAt - now) / 1000));
}

/**
 * Check rate limit for a request. Returns null if allowed,
 * or a 429 NextResponse if the limit is exceeded.
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
): Promise<NextResponse | null> {
  // Cloudflare sets cf-connecting-ip and overwrites any client copy;
  // X-Forwarded-For and X-Real-IP arrive as the caller wrote them.
  const ip = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
  const key = `${config.bucket}:${ip}`;

  const binding = await workerBinding(config.binding);
  if (!binding) return checkInMemory(key, config);
  const { success } = await binding.limit({ key });
  return success ? null : tooManyRequests(config.windowSeconds);
}
