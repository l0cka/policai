import pg from 'pg';
import { getCloudflareContext } from '@opennextjs/cloudflare';

type HyperdriveEnv = { HYPERDRIVE?: { connectionString: string } };

const globalForPg = globalThis as typeof globalThis & { pgPool?: pg.Pool };

// A Worker may not reuse a socket opened by another request, so on Workers
// each request gets its own small pool, keyed on its execution context.
// Hyperdrive keeps the real connections to Postgres warm between requests.
const requestPools = new WeakMap<object, pg.Pool>();

function onWorkers(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

function hyperdriveUrl(): string | undefined {
  return (getCloudflareContext().env as HyperdriveEnv).HYPERDRIVE?.connectionString;
}

export function databaseConfigured(): boolean {
  return Boolean(onWorkers() ? hyperdriveUrl() : process.env.DATABASE_URL);
}

export function getPool(): pg.Pool {
  if (onWorkers()) {
    const { ctx } = getCloudflareContext();
    let pool = requestPools.get(ctx);
    if (!pool) {
      const url = hyperdriveUrl();
      if (!url) throw new Error('HYPERDRIVE binding is not set');
      pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 1000 });
      requestPools.set(ctx, pool);
    }
    return pool;
  }
  if (!globalForPg.pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForPg.pgPool = new pg.Pool({ connectionString: url, max: 5 });
  }
  return globalForPg.pgPool;
}
