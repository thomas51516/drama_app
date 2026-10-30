<script setup lang="ts">
import { computed } from 'vue'
import { countryName } from '../../utils/countries'
import { RECHARGE_COUNTRIES } from '../../utils/topup'

/** Country of the shop (currency and operators), as a native select for weight and reach. */
defineProps<{ modelValue: string; inputId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { locale } = useI18n()

const options = computed(() =>
  RECHARGE_COUNTRIES.map(({ code, currency }) => ({
    code,
    label: `${countryName(code, locale.value)} (${currency})`,
  })),
)
</script>

<template>
  <select
    :id="inputId"
    class="w-full rounded-lg border border-surface-300 bg-surface-0 px-3 py-2.5 text-base text-surface-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
    :value="modelValue"
    data-testid="country-select"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.code" :value="option.code">
      {{ option.label }}
    </option>
  </select>
</template>
