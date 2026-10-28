import { defineConfig } from 'vitest/config';

// Tests de bout en bout : test/**/*.e2e-spec.ts (PostgreSQL + Redis réels, voir README).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
