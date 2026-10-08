import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// Plan M7 Y2: files run in parallel, each on its own database copied from a migrated template.
const workers = Number(process.env.VG_TEST_WORKERS) || Math.min(3, availableParallelism() - 1);

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    testTimeout: 20_000,
    globalSetup: ['packages/db/test/global-setup.ts'],
    fileParallelism: true,
    maxWorkers: Math.max(1, workers),
  },
});
