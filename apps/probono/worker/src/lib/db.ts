import { readFileSync } from 'node:fs';
import pg from 'pg';

let pool: pg.Pool | undefined;

function passwordFile(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`POSTGRES_PASSWORD_FILE: cannot read ${path}`);
  }
  const password = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (!password) throw new Error(`POSTGRES_PASSWORD_FILE: ${path} is empty`);
  return password;
}

export function databaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const file = env.POSTGRES_PASSWORD_FILE;
  if (!file) return url;
  if (env.POSTGRES_PASSWORD) {
    throw new Error('POSTGRES_PASSWORD and POSTGRES_PASSWORD_FILE are both set');
  }
  const parsed = new URL(url);
  if (parsed.password) {
    throw new Error('DATABASE_URL carries a password and POSTGRES_PASSWORD_FILE is set');
  }
  parsed.password = encodeURIComponent(passwordFile(file));
  return parsed.href;
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl(process.env), max: 3 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
