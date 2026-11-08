<script setup lang="ts">
import { useRechargePrefs } from '#base/composables/useRechargePrefs'
import { useThemePrefs } from '#base/composables/useThemePrefs'

/**
 * Recharge site shell. The interface language comes from the `drama_lang` cookie (French by
 * default) and the theme from `drama_theme`, both applied before the first render on server and
 * client so hydration matches (no flash of the other language or theme).
 */
const { setLocale } = useI18n()
const prefs = useRechargePrefs()
const themePrefs = useThemePrefs()
if (prefs.language.value && prefs.language.value !== 'fr') {
  await setLocale(prefs.language.value)
}
useHead({
  htmlAttrs: {
    lang: prefs.language.value ?? 'fr',
    class: computed(() => (themePrefs.isDark.value ? 'app-dark' : '')),
  },
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
