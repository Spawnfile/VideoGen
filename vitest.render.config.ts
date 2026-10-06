import { defineConfig } from 'vitest/config';

/** Real tools (bubblewrap, Blender on the NVIDIA GPU, ffmpeg): `npm run test:render`. Not part of `npm test` (plan B19). */
export default defineConfig({
  test: {
    include: ['packages/*/test-render/**/*.int.test.ts', 'apps/*/test-render/**/*.int.test.ts'],
    testTimeout: 240_000,
    fileParallelism: false,
  },
});
