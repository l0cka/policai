import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    setupFiles: ['./test/support/require-disposable-database.ts'],
    exclude: [...configDefaults.exclude, 'security-test/**'],
  },
});
