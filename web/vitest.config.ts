import { fileURLToPath } from 'node:url'
import { defineVitestConfig } from '@nuxt/test-utils/config'

/**
 * Tests run inside the Nuxt runtime of the admin app (auto-imports, Pinia, runtime config),
 * so base-layer code is tested exactly as the app consumes it.
 */
export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['layers/**/tests/**/*.spec.ts', 'apps/**/tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/.nuxt/**', '**/.output/**'],
    environmentOptions: {
      nuxt: {
        rootDir: fileURLToPath(new URL('./apps/admin', import.meta.url)),
        domEnvironment: 'happy-dom',
        overrides: {
          runtimeConfig: {
            public: {
              apiMock: true,
              apiBase: 'http://api.test',
            },
          },
        },
      },
    },
  },
})
