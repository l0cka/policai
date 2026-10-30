import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'pg-connection-string';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseUrl } from '../src/lib/db.js';

const URL_WITHOUT_PASSWORD = 'postgres://radar@127.0.0.1:5433/radar';

describe('databaseUrl', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'probono-secret-'));
    file = join(dir, 'postgres_password');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the password from POSTGRES_PASSWORD_FILE and trims one trailing newline', () => {
    writeFileSync(file, 'fixture-secret\n');
    const config = parse(databaseUrl({ DATABASE_URL: URL_WITHOUT_PASSWORD, POSTGRES_PASSWORD_FILE: file }));
    expect(config).toMatchObject({
      user: 'radar', password: 'fixture-secret', host: '127.0.0.1', port: '5433', database: 'radar',
    });
  });

  it('keeps a password that needs URL escaping intact for pg', () => {
    writeFileSync(file, 'fixture:secret/with@url%chars#?');
    const config = parse(databaseUrl({ DATABASE_URL: URL_WITHOUT_PASSWORD, POSTGRES_PASSWORD_FILE: file }));
    expect(config.password).toBe('fixture:secret/with@url%chars#?');
  });

  it('trims only a single trailing newline', () => {
    writeFileSync(file, 'fixture-secret\n\n');
    const config = parse(databaseUrl({ DATABASE_URL: URL_WITHOUT_PASSWORD, POSTGRES_PASSWORD_FILE: file }));
    expect(config.password).toBe('fixture-secret\n');
  });

  it('returns DATABASE_URL unchanged when no password source is set', () => {
    const url = 'postgres://radar:fixture-secret@127.0.0.1:5432/radar_test';
    expect(databaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  it('leaves DATABASE_URL alone when only POSTGRES_PASSWORD is in the environment', () => {
    const url = 'postgres://radar:fixture-secret@127.0.0.1:5432/radar_test';
    expect(databaseUrl({ DATABASE_URL: url, POSTGRES_PASSWORD: 'fixture-secret' })).toBe(url);
  });

  it('fails naming the variable when the password file is missing', () => {
    expect(() => databaseUrl({ DATABASE_URL: URL_WITHOUT_PASSWORD, POSTGRES_PASSWORD_FILE: file }))
      .toThrow(`POSTGRES_PASSWORD_FILE: cannot read ${file}`);
  });

  it('fails naming the variable when the password file is empty', () => {
    writeFileSync(file, '\n');
    expect(() => databaseUrl({ DATABASE_URL: URL_WITHOUT_PASSWORD, POSTGRES_PASSWORD_FILE: file }))
      .toThrow(`POSTGRES_PASSWORD_FILE: ${file} is empty`);
  });

  it('refuses POSTGRES_PASSWORD and POSTGRES_PASSWORD_FILE together without revealing either value', () => {
    writeFileSync(file, 'fixture-secret-from-file');
    const run = () => databaseUrl({
      DATABASE_URL: URL_WITHOUT_PASSWORD,
      POSTGRES_PASSWORD: 'fixture-secret-from-env',
      POSTGRES_PASSWORD_FILE: file,
    });
    expect(run).toThrow('POSTGRES_PASSWORD and POSTGRES_PASSWORD_FILE are both set');
    expect(run).not.toThrow(/fixture-secret/);
  });

  it('refuses a password file when DATABASE_URL already carries a password', () => {
    writeFileSync(file, 'fixture-secret-from-file');
    const run = () => databaseUrl({
      DATABASE_URL: 'postgres://radar:fixture-secret-in-url@127.0.0.1:5433/radar',
      POSTGRES_PASSWORD_FILE: file,
    });
    expect(run).toThrow('DATABASE_URL carries a password and POSTGRES_PASSWORD_FILE is set');
    expect(run).not.toThrow(/fixture-secret/);
  });

  it('fails when DATABASE_URL is not set', () => {
    expect(() => databaseUrl({})).toThrow('DATABASE_URL is not set');
  });
});
