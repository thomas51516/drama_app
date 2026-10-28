export default defineNuxtConfig({
  extends: ['../../layers/base'],

  ssr: false,

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
