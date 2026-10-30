<script setup lang="ts">
import { computed } from 'vue'
import {
  RECHARGE_LANGUAGES,
  useRechargePrefs,
  type RechargeLanguage,
} from '../../composables/useRechargePrefs'

/** FR / EN / ES / PT switcher persisted in the `drama_lang` cookie. */
const { locale, setLocale } = useI18n()
const prefs = useRechargePrefs()

const NAMES: Record<RechargeLanguage, string> = { fr: 'FR', en: 'EN', es: 'ES', pt: 'PT' }
const options = computed(() => RECHARGE_LANGUAGES.map((code) => ({ code, label: NAMES[code] })))

async function onChange(event: Event): Promise<void> {
  const value = (event.target as HTMLSelectElement).value as RechargeLanguage
  prefs.language.value = value
  await setLocale(value)
}
</script>

<template>
  <label class="inline-flex items-center gap-1 text-xs text-muted-color">
    <i class="pi pi-globe" aria-hidden="true" />
    <span class="sr-only">{{ $t('recharge.language') }}</span>
    <select
      class="rounded-md border border-surface-300 bg-surface-0 px-2 py-1 text-xs font-medium text-surface-900"
      :value="locale"
      data-testid="language-select"
      @change="onChange"
    >
      <option v-for="option in options" :key="option.code" :value="option.code">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
