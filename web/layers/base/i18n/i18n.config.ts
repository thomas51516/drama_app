export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
  // ES / PT files are partial on purpose (recharge site): no console noise for the FR fallback.
  missingWarn: false,
  fallbackWarn: false,
  datetimeFormats: {
    fr: {
      short: { year: 'numeric', month: '2-digit', day: '2-digit' },
      long: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    },
    en: {
      short: { year: 'numeric', month: '2-digit', day: '2-digit' },
      long: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    },
    // ES / PT only carry the recharge site; `formatZoned()` passes an explicit locale string to
    // `Intl.DateTimeFormat` anyway, so these only exist to satisfy vue-i18n's registered-locale type.
    es: {
      short: { year: 'numeric', month: '2-digit', day: '2-digit' },
      long: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    },
    pt: {
      short: { year: 'numeric', month: '2-digit', day: '2-digit' },
      long: {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      },
    },
  },
}))
