<script setup lang="ts">
import { computed } from 'vue'
import type { CoinPackAdmin } from '../../types/api'
import { formatPrice } from '../../utils/monetization'

/** Select of the coin packs by sku (inactive packs are listed but flagged). */
const props = defineProps<{
  modelValue: string | null
  packs: readonly CoinPackAdmin[]
  inputId?: string
  disabled?: boolean
  invalid?: boolean
  /** Adds a first option « Tous les packs » bound to `null`. */
  allowAll?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const { t, locale } = useI18n()

const options = computed(() => {
  const items = props.packs.map((pack) => ({
    value: pack.sku,
    label: `${pack.sku} — ${pack.coins + pack.bonusCoins} ${t('series.form.coins')} · ${formatPrice(
      pack.prices.find((price) => price.currency === 'XOF') ?? pack.prices[0],
      locale.value,
    )}${pack.isActive ? '' : ` (${t('offers.packs.inactive')})`}`,
  }))
  return props.allowAll ? [{ value: null, label: t('offers.packs.all') }, ...items] : items
})
</script>

<template>
  <Select
    :model-value="modelValue"
    :options="options"
    option-label="label"
    option-value="value"
    :input-id="inputId"
    :disabled="disabled"
    :invalid="invalid"
    :placeholder="t('offers.packs.placeholder')"
    fluid
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
