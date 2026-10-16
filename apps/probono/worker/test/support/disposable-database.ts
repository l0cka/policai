import { parse } from 'pg-connection-string';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const TEST_DATABASE_NAME = /_test$/;

interface EffectiveConnection {
  host: string | undefined;
  database: string | undefined;
}

function effectiveConnection(databaseUrl: string): EffectiveConnection {
  if (!URL.canParse(databaseUrl)) {
    throw new Error('Refusing to run tests: DATABASE_URL is not a parseable URL');
  }
  const { host, database } = parse(databaseUrl);
  return { host: host || undefined, database: database || undefined };
}

export function assertDisposableDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) return;
  const { host, database } = effectiveConnection(databaseUrl);
  if (host === undefined) {
    throw new Error('Refusing to run tests: DATABASE_URL names no host, so pg would use PGHOST');
  }
  if (database === undefined) {
    throw new Error(
      'Refusing to run tests: DATABASE_URL names no database, so pg would use PGDATABASE',
    );
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to run tests: host "${host}" is not 127.0.0.1 or localhost`);
  }
  if (!TEST_DATABASE_NAME.test(database)) {
    throw new Error(`Refusing to run tests: database "${database}" does not end in _test`);
  }
}
