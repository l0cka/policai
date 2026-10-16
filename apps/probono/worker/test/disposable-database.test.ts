import { describe, expect, it } from 'vitest';
import { assertDisposableDatabase } from './support/disposable-database.js';

const CI_URL = 'postgres://probono_ci:probono_ci@127.0.0.1:5432/probono_ci_test';

describe('assertDisposableDatabase', () => {
  it('refuses the compose radar database', () => {
    expect(() =>
      assertDisposableDatabase('postgres://radar:x@127.0.0.1:5433/radar'),
    ).toThrow(/does not end in _test/);
  });

  it('accepts the CI disposable database', () => {
    expect(() => assertDisposableDatabase(CI_URL)).not.toThrow();
  });

  it('accepts localhost with a test database', () => {
    expect(() =>
      assertDisposableDatabase('postgres://u:p@localhost:5433/radar_test'),
    ).not.toThrow();
  });

  it('refuses a remote host even with a test database name', () => {
    expect(() =>
      assertDisposableDatabase('postgres://u:p@db.example.com:5432/radar_test'),
    ).toThrow(/not 127\.0\.0\.1 or localhost/);
  });

  it('refuses a host that merely starts with localhost', () => {
    expect(() =>
      assertDisposableDatabase('postgres://u:p@localhost.evil.example/radar_test'),
    ).toThrow(/not 127\.0\.0\.1 or localhost/);
  });

  it('refuses an unparseable URL', () => {
    expect(() => assertDisposableDatabase('not a url')).toThrow(/parseable/);
  });

  it('allows an unset or empty URL so integration suites skip', () => {
    expect(() => assertDisposableDatabase(undefined)).not.toThrow();
    expect(() => assertDisposableDatabase('')).not.toThrow();
  });
});
