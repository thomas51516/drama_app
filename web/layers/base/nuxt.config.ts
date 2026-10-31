import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import Aura from '@primeuix/themes/aura'
import frLocale from 'primelocale/fr.json' with { type: 'json' }

const currentDir = fileURLToPath(new URL('.', import.meta.url))

/**
 * Base layer shared by every Drama Nye web app (admin back-office, recharge site).
 * Apps extend it with `extends: ['../../layers/base']` and only add pages and overrides.
 */
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',

  modules: ['@nuxt/eslint', '@pinia/nuxt', '@nuxtjs/i18n', '@primevue/nuxt-module'],

  alias: {
    // Lets apps import layer code without relative paths: `import type { X } from '#base/types/api'`.
    '#base': currentDir,
  },

  typescript: {
    strict: true,
    // Type checking is run explicitly through `nuxt typecheck` (vue-tsc), not during dev/build.
    typeCheck: false,
  },

  css: [
    'primeicons/primeicons.css',
    fileURLToPath(new URL('./assets/css/main.css', import.meta.url)),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    public: {
      // Overridable at runtime with NUXT_PUBLIC_API_BASE / NUXT_PUBLIC_API_MOCK.
      apiBase: 'http://localhost:3000',
      apiMock: process.env.NODE_ENV === 'development',
      // Public base of media keys (HLS manifests, thumbnails): MinIO bucket in dev, CDN in prod.
      cdnBaseUrl: 'http://localhost:9000/drama-media',
      appName: 'Drama Nye',
    },
  },

  eslint: {
    config: {
      // Formatting is delegated to Prettier.
      stylistic: false,
    },
  },

  i18n: {
    locales: [
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      // ES and PT only carry the recharge site (and a few shared keys); the rest falls back to FR.
      { code: 'es', language: 'es-ES', name: 'Español', file: 'es.json' },
      { code: 'pt', language: 'pt-PT', name: 'Português', file: 'pt.json' },
    ],
    defaultLocale: 'fr',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    // Locale files live in <layer>/i18n/locales ; apps can add their own files for the same codes.
    langDir: 'locales',
    vueI18n: `${currentDir}/i18n/i18n.config.ts`,
  },

  primevue: {
    autoImport: true,
    options: {
      ripple: false,
      // Full French locale for built-in component texts (calendar, filters, file upload...).
      locale: frLocale.fr,
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.app-dark',
          // Tailwind v4 + PrimeVue: explicit CSS layer order so utilities win over theme styles.
          cssLayer: {
            name: 'primevue',
            order: 'theme, base, primevue',
          },
        },
      },
    },
  },
})
