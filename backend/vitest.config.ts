import { defineConfig } from 'vitest/config';

// Tests unitaires : src/**/*.spec.ts (aucune dépendance externe).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/**/*.spec.ts',
        'src/**/*.dto.ts',
        'src/main.ts',
        'src/openapi-export.ts',
      ],
    },
  },
});
