const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const TEST_DATABASE_NAME = /_test$/;

export function assertDisposableDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) return;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing to run tests: DATABASE_URL is not a parseable URL');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to run tests: host "${url.hostname}" is not 127.0.0.1 or localhost`,
    );
  }
  if (!TEST_DATABASE_NAME.test(database)) {
    throw new Error(
      `Refusing to run tests: database "${database}" does not end in _test`,
    );
  }
}
