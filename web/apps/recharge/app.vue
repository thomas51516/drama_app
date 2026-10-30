<script setup lang="ts">
import { useRechargePrefs } from '#base/composables/useRechargePrefs'

/**
 * Recharge site shell. The interface language comes from the `drama_lang` cookie (French by
 * default), applied before the first render on both server and client so hydration matches.
 */
const { setLocale } = useI18n()
const prefs = useRechargePrefs()
if (prefs.language.value && prefs.language.value !== 'fr') {
  await setLocale(prefs.language.value)
}
useHead({ htmlAttrs: { lang: prefs.language.value ?? 'fr' } })
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
