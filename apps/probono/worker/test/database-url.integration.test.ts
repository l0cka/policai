import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../src/lib/db.js';

const DB = process.env.DATABASE_URL;
const describeWithPassword = DB && new URL(DB).password ? describe : describe.skip;

describeWithPassword('getPool with POSTGRES_PASSWORD_FILE (integration)', () => {
  let dir: string;

  beforeAll(async () => {
    const url = new URL(DB!);
    dir = mkdtempSync(join(tmpdir(), 'probono-secret-'));
    const file = join(dir, 'postgres_password');
    writeFileSync(file, `${decodeURIComponent(url.password)}\n`);
    url.password = '';
    await closePool();
    process.env.DATABASE_URL = url.href;
    process.env.POSTGRES_PASSWORD_FILE = file;
  });

  afterAll(async () => {
    await closePool();
    process.env.DATABASE_URL = DB;
    delete process.env.POSTGRES_PASSWORD_FILE;
    rmSync(dir, { recursive: true, force: true });
  });

  it('authenticates with the password read from the file', async () => {
    const { rows } = await getPool().query('SELECT current_user AS user');
    expect(rows[0].user).toBe(new URL(DB!).username);
  });
});
