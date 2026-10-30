import { NextResponse } from 'next/server';

/**
 * Simple in-memory fixed-window rate limiter.
 * Tracks requests per client IP and bucket, with cleanup of expired entries.
 *
 * Note: In-memory state is per-instance and resets on deploy. This provides
 * basic protection against abuse, not a hard guarantee. For stronger rate
 * limiting, use Cloudflare rate limiting rules.
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
  /** Maximum requests per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Check rate limit for a request. Returns null if allowed,
 * or a 429 NextResponse if the limit is exceeded.
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
): NextResponse | null {
  // Cloudflare sets cf-connecting-ip and overwrites any client copy;
  // X-Forwarded-For and X-Real-IP arrive as the caller wrote them.
  const ip = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';

  const key = `${config.bucket}:${ip}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return null;
  }

  entry.count++;

  if (entry.count > config.limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests', success: false },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }

  return null;
}
