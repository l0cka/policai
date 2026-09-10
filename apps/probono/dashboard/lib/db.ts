import pg from 'pg';

const globalForPg = globalThis as typeof globalThis & { pgPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPg.pgPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForPg.pgPool = new pg.Pool({ connectionString: url, max: 5 });
  }
  return globalForPg.pgPool;
}
