export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'fr',
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
  },
}))
