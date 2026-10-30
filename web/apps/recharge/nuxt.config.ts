export default defineNuxtConfig({
  extends: ['../../layers/base'],

  // Server-side rendering (cahier des charges §11): fast first paint on low-end phones.
  ssr: true,

  // Lets a second `nuxt build` / `nuxt dev` run next to a dev server on the same checkout:
  // NUXT_BUILD_DIR=/tmp/x npm run build:recharge.
  ...(process.env.NUXT_BUILD_DIR ? { buildDir: process.env.NUXT_BUILD_DIR } : {}),

  app: {
    head: {
      title: 'DRAMA — Recharge',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0f172a' },
        {
          name: 'description',
          content:
            'Rechargez vos pièces DRAMA par mobile money, sur le même compte que l’application.',
        },
      ],
    },
  },

  runtimeConfig: {
    public: {
      appName: 'DRAMA Recharge',
      // Google sign-in button is shown only when a client id is configured
      // (NUXT_PUBLIC_GOOGLE_CLIENT_ID); the backend must list it in GOOGLE_CLIENT_IDS.
      googleClientId: '',
    },
  },

  devtools: { enabled: false },
})
