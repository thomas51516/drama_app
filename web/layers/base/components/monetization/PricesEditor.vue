<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Currency } from '../../types/api'
import { CURRENCIES } from '../../types/api'
import {
  BASE_CURRENCY,
  CURRENCY_DECIMALS,
  DEFAULT_RATES_FROM_XOF,
  fillPricesFromXof,
  type PriceForm,
  type RatesFromXof,
} from '../../utils/monetization'

/**
 * Prices per currency (B-06): one amount per currency in major units, plus a helper that fills
 * the empty currencies from the XOF price with indicative, editable rates.
 */
const props = defineProps<{
  modelValue: PriceForm
  disabled?: boolean
  error?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: PriceForm] }>()

const { t } = useI18n()

const rates = ref<RatesFromXof>({ ...DEFAULT_RATES_FROM_XOF })
const otherCurrencies = CURRENCIES.filter((currency) => currency !== BASE_CURRENCY)
const showRates = ref(false)
const overwrite = ref(false)

const canFill = computed(() => {
  const xof = props.modelValue[BASE_CURRENCY]
  return typeof xof === 'number' && Number.isFinite(xof) && xof > 0
})

function update(currency: Currency, value: number | null): void {
  emit('update:modelValue', { ...props.modelValue, [currency]: value })
}

function fill(): void {
  emit('update:modelValue', fillPricesFromXof(props.modelValue, rates.value, overwrite.value))
}

function resetRates(): void {
  rates.value = { ...DEFAULT_RATES_FROM_XOF }
}

function rateDigits(currency: Currency): number {
  return currency === 'EUR' || currency === 'USD' ? 6 : 4
}
</script>

<template>
  <fieldset class="flex flex-col gap-3" data-testid="prices-editor">
    <legend class="text-sm font-medium">{{ t('monetization.form.prices') }}</legend>
    <p class="text-xs text-muted-color">{{ t('monetization.form.pricesHint') }}</p>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div v-for="currency in CURRENCIES" :key="currency" class="flex flex-col gap-1">
        <label :for="`price-${currency}`" class="text-xs font-medium text-muted-color">
          {{ currency }}<span v-if="currency === BASE_CURRENCY" aria-hidden="true"> *</span>
        </label>
        <InputNumber
          :input-id="`price-${currency}`"
          :model-value="modelValue[currency]"
          :min="0"
          :min-fraction-digits="CURRENCY_DECIMALS[currency]"
          :max-fraction-digits="CURRENCY_DECIMALS[currency]"
          :disabled="disabled"
          :invalid="Boolean(error) && currency === BASE_CURRENCY && modelValue[currency] === null"
          :aria-label="t('monetization.form.priceIn', { currency })"
          :suffix="` ${currency}`"
          locale="fr-FR"
          fluid
          @update:model-value="update(currency, $event ?? null)"
        />
      </div>
    </div>
    <small v-if="error" class="text-xs text-red-600" data-testid="prices-error">{{ error }}</small>

    <div class="flex flex-wrap items-center gap-3 rounded-md bg-surface-100 p-3">
      <Button
        type="button"
        :label="t('monetization.form.fillFromXof')"
        icon="pi pi-calculator"
        size="small"
        severity="secondary"
        outlined
        :disabled="disabled || !canFill"
        data-testid="fill-from-xof"
        @click="fill"
      />
      <div class="flex items-center gap-2">
        <Checkbox v-model="overwrite" input-id="prices-overwrite" binary :disabled="disabled" />
        <label for="prices-overwrite" class="text-xs">{{ t('monetization.form.overwrite') }}</label>
      </div>
      <Button
        type="button"
        :label="t('monetization.form.rates')"
        :icon="showRates ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
        size="small"
        text
        severity="secondary"
        @click="showRates = !showRates"
      />
      <p class="basis-full text-xs text-muted-color">
        {{ t('monetization.form.fillFromXofHint') }}
      </p>

      <div v-if="showRates" class="basis-full">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="currency in otherCurrencies" :key="currency" class="flex flex-col gap-1">
            <label :for="`rate-${currency}`" class="text-xs text-muted-color">
              {{ t('monetization.form.rateFor', { currency }) }}
            </label>
            <InputNumber
              v-model="rates[currency]"
              :input-id="`rate-${currency}`"
              :min="0"
              :min-fraction-digits="0"
              :max-fraction-digits="rateDigits(currency)"
              locale="fr-FR"
              size="small"
              fluid
            />
          </div>
        </div>
        <Button
          type="button"
          :label="t('monetization.form.resetRates')"
          size="small"
          text
          class="mt-2"
          @click="resetRates"
        />
      </div>
    </div>
  </fieldset>
</template>
