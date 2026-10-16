import { assertDisposableDatabase } from './disposable-database.js';

assertDisposableDatabase(process.env.DATABASE_URL);
