export default defineNuxtConfig({
  extends: ['../../layers/base'],

  ssr: false,

  // Lets a second `nuxt build` / `nuxt dev` (CI, agents, checks) run next to the developer's dev
  // server without fighting over `.nuxt/`: NUXT_BUILD_DIR=/tmp/x npm run build:admin.
  ...(process.env.NUXT_BUILD_DIR ? { buildDir: process.env.NUXT_BUILD_DIR } : {}),

  app: {
    head: {
      title: 'DRAMA — Back-office',
      htmlAttrs: { lang: 'fr' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      appName: 'DRAMA Back-office',
    },
  },

  devtools: { enabled: true },
})
