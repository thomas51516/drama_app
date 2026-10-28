<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  countryName,
  countryOptions,
  FRANCOPHONE_CODES,
  isIsoCountryCode,
  normalizeCountryCode,
  type CountryOption,
} from '../../utils/countries'

/**
 * Chips of ISO 3166-1 alpha-2 codes with a suggestion list (code or country name) and shortcuts.
 * Any valid two-letter code typed by hand is accepted; the form validation rejects anything else.
 */
const props = defineProps<{
  modelValue: string[]
  disabled?: boolean
  invalid?: boolean
  inputId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const { t, locale } = useI18n()

const options = computed(() => countryOptions(locale.value))
const suggestions = ref<CountryOption[]>([])

const selected = computed<CountryOption[]>(() =>
  props.modelValue.map((code) => ({
    code,
    name: countryName(code, locale.value),
    label: `${code} — ${countryName(code, locale.value)}`,
  })),
)

function setCodes(codes: string[]): void {
  const unique = Array.from(new Set(codes.map(normalizeCountryCode).filter(Boolean)))
  emit('update:modelValue', unique)
}

function search(event: { query: string }): void {
  const query = event.query.trim().toLowerCase()
  const taken = new Set(props.modelValue)
  const matches = options.value.filter(
    (option) =>
      !taken.has(option.code) &&
      (option.code.toLowerCase().startsWith(query) || option.name.toLowerCase().includes(query)),
  )
  // Let a valid code outside the suggestion list be added as-is.
  const typed = normalizeCountryCode(query)
  if (
    isIsoCountryCode(typed) &&
    !taken.has(typed) &&
    !matches.some((option) => option.code === typed)
  ) {
    matches.unshift({ code: typed, name: countryName(typed, locale.value), label: typed })
  }
  suggestions.value = matches.slice(0, 12)
}

function onUpdate(value: (CountryOption | string)[]): void {
  setCodes(value.map((entry) => (typeof entry === 'string' ? entry : entry.code)))
}

function addFrancophone(): void {
  setCodes([...props.modelValue, ...FRANCOPHONE_CODES])
}

function clear(): void {
  setCodes([])
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <AutoComplete
      :model-value="selected"
      :suggestions="suggestions"
      option-label="label"
      multiple
      fluid
      :disabled="disabled"
      :invalid="invalid"
      :input-id="inputId"
      :placeholder="modelValue.length === 0 ? t('series.territories.placeholder') : undefined"
      :complete-on-focus="true"
      @complete="search"
      @update:model-value="onUpdate"
    >
      <template #chip="{ value, removeCallback }">
        <span class="inline-flex items-center gap-1" :title="value.name">
          <span class="font-mono text-xs font-semibold">{{ value.code }}</span>
          <span class="hidden text-xs text-muted-color sm:inline">{{ value.name }}</span>
          <button
            v-if="!disabled"
            type="button"
            class="pi pi-times-circle text-xs"
            :aria-label="t('common.remove')"
            @click="removeCallback"
          />
        </span>
      </template>
    </AutoComplete>
    <div class="flex flex-wrap items-center gap-2 text-xs text-muted-color">
      <span>{{
        t('series.territories.count', { count: modelValue.length }, modelValue.length)
      }}</span>
      <Button
        type="button"
        :label="t('series.territories.francophone')"
        size="small"
        text
        :disabled="disabled"
        @click="addFrancophone"
      />
      <Button
        type="button"
        :label="t('common.clear')"
        size="small"
        text
        severity="secondary"
        :disabled="disabled || modelValue.length === 0"
        @click="clear"
      />
    </div>
  </div>
</template>
