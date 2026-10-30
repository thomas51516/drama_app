<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PromoCode } from '../../types/api'
import { useOffersApi } from '../../composables/useOffersApi'
import { useNotify } from '../../composables/useNotify'
import { ApiError } from '../../utils/api-error'
import {
  PROMO_COINS_MAX,
  PROMO_MAX_USES_MAX,
  PROMO_PER_USER_MAX,
  emptyPromoCodeForm,
  generatePromoCode,
  normalizePromoCode,
  promoCodeToForm,
  promoCodeToInput,
  validatePromoCode,
  type PromoCodeErrors,
} from '../../utils/offers'
import { fromPickerDate, toPickerDate } from '../../utils/schedule'

/** Create / edit a promo code. The code is immutable once created; a generator proposes one. */
const props = defineProps<{ visible: boolean; promo: PromoCode | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; saved: [promo: PromoCode] }>()

const { t } = useI18n()
const api = useOffersApi()
const notify = useNotify()

const form = ref(emptyPromoCodeForm())
const unlimited = ref(true)
const prefix = ref('DRAMA-')
const startsAtPicker = ref<Date | null>(null)
const endsAtPicker = ref<Date | null>(null)
const errors = ref<PromoCodeErrors>({})
const submitted = ref(false)
const saving = ref(false)

const isEdit = computed(() => props.promo !== null)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.promo ? promoCodeToForm(props.promo) : emptyPromoCodeForm()
    unlimited.value = form.value.maxUses === null
    startsAtPicker.value = toPickerDate(form.value.startsAt)
    endsAtPicker.value = toPickerDate(form.value.endsAt)
    errors.value = {}
    submitted.value = false
  },
)

watch(unlimited, (value) => {
  form.value.maxUses = value ? null : (form.value.maxUses ?? 100)
})
watch(startsAtPicker, (value) => {
  form.value.startsAt = fromPickerDate(value)
})
watch(endsAtPicker, (value) => {
  form.value.endsAt = fromPickerDate(value)
})
watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validatePromoCode(values, isEdit.value)
  },
  { deep: true },
)

function generate(): void {
  form.value.code = generatePromoCode({ prefix: prefix.value, length: 8 })
}

function onCodeBlur(): void {
  form.value.code = normalizePromoCode(form.value.code)
}

function errorMessage(key: keyof PromoCodeErrors): string | undefined {
  const code = errors.value[key]
  if (!code) return undefined
  const max =
    key === 'coins' ? PROMO_COINS_MAX : key === 'maxUses' ? PROMO_MAX_USES_MAX : PROMO_PER_USER_MAX
  return t(code, { max, min: 1 })
}

async function save(): Promise<void> {
  submitted.value = true
  form.value.code = normalizePromoCode(form.value.code)
  errors.value = validatePromoCode(form.value, isEdit.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  const input = promoCodeToInput(form.value, props.promo ?? undefined)
  if (props.promo && Object.keys(input).length === 0) {
    emit('update:visible', false)
    return
  }
  saving.value = true
  try {
    const saved = props.promo
      ? await api.updatePromoCode(props.promo.id, input)
      : await api.createPromoCode(input)
    notify.success(
      props.promo ? t('offers.promo.saved') : t('offers.promo.created', { code: saved.code }),
      t('monetization.audited'),
    )
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    if (ApiError.is(err) && err.code === 'PROMO_CODE_ALREADY_USED') {
      errors.value = { ...errors.value, code: 'offers.promo.codeTaken' }
      notify.error(t('offers.promo.saveFailed'), t('offers.promo.codeTaken'))
    } else {
      notify.apiError(err, t('offers.promo.saveFailed'))
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="isEdit ? t('offers.promo.edit') : t('offers.promo.create')"
    :style="{ width: 'min(40rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form
      class="flex flex-col gap-5"
      novalidate
      data-testid="promo-code-form"
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-1">
        <label for="promo-code" class="text-sm font-medium">{{
          t('offers.promo.columns.code')
        }}</label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <InputText
            id="promo-code"
            v-model="form.code"
            class="font-mono uppercase"
            :maxlength="32"
            :invalid="Boolean(errors.code)"
            :disabled="saving || isEdit"
            placeholder="DRAMA-K7M2X9PQ"
            autocomplete="off"
            fluid
            @blur="onCodeBlur"
          />
          <div v-if="!isEdit" class="flex gap-2">
            <InputText
              v-model="prefix"
              class="w-28 font-mono uppercase"
              :maxlength="12"
              :disabled="saving"
              :aria-label="t('offers.promo.prefix')"
              :placeholder="t('offers.promo.prefix')"
            />
            <Button
              type="button"
              icon="pi pi-sparkles"
              :label="t('offers.promo.generate')"
              severity="secondary"
              outlined
              :disabled="saving"
              data-testid="generate-code"
              @click="generate"
            />
          </div>
        </div>
        <small v-if="errors.code" class="text-xs text-red-600">{{ errorMessage('code') }}</small>
        <small v-else class="text-xs text-muted-color">{{
          isEdit ? t('offers.promo.codeLocked') : t('offers.promo.codeHint')
        }}</small>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="flex flex-col gap-1">
          <label for="promo-coins" class="text-sm font-medium">{{
            t('offers.promo.columns.coins')
          }}</label>
          <InputNumber
            v-model="form.coins"
            input-id="promo-coins"
            :min="1"
            :max="PROMO_COINS_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.coins)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.coins" class="text-xs text-red-600">{{
            errorMessage('coins')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{ t('offers.promo.coinsHint') }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="promo-max" class="text-sm font-medium">{{ t('offers.promo.maxUses') }}</label>
          <InputNumber
            v-model="form.maxUses"
            input-id="promo-max"
            :min="1"
            :max="PROMO_MAX_USES_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.maxUses)"
            :disabled="saving || unlimited"
            fluid
          />
          <small v-if="errors.maxUses" class="text-xs text-red-600">{{
            errorMessage('maxUses')
          }}</small>
          <div class="flex items-center gap-2">
            <Checkbox v-model="unlimited" input-id="promo-unlimited" binary :disabled="saving" />
            <label for="promo-unlimited" class="text-xs">{{ t('offers.promo.unlimited') }}</label>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="promo-per-user" class="text-sm font-medium">{{
            t('offers.promo.perUserUses')
          }}</label>
          <InputNumber
            v-model="form.perUserUses"
            input-id="promo-per-user"
            :min="1"
            :max="PROMO_PER_USER_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.perUserUses)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.perUserUses" class="text-xs text-red-600">{{
            errorMessage('perUserUses')
          }}</small>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="promo-starts" class="text-sm font-medium"
            >{{ t('offers.form.startsAt') }}
            <span class="font-normal text-muted-color">({{ t('common.optional') }})</span></label
          >
          <DatePicker
            v-model="startsAtPicker"
            input-id="promo-starts"
            show-time
            hour-format="24"
            show-icon
            show-button-bar
            date-format="dd/mm/yy"
            :invalid="Boolean(errors.startsAt)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.startsAt" class="text-xs text-red-600">{{
            errorMessage('startsAt')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="promo-ends" class="text-sm font-medium"
            >{{ t('offers.form.endsAt') }}
            <span class="font-normal text-muted-color">({{ t('common.optional') }})</span></label
          >
          <DatePicker
            v-model="endsAtPicker"
            input-id="promo-ends"
            show-time
            hour-format="24"
            show-icon
            show-button-bar
            date-format="dd/mm/yy"
            :invalid="Boolean(errors.endsAt)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.endsAt" class="text-xs text-red-600">{{
            errorMessage('endsAt')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{ t('offers.form.lomeTime') }}</small>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isActive" input-id="promo-active" :disabled="saving" />
        <label for="promo-active" class="text-sm">{{ t('monetization.form.active') }}</label>
      </div>

      <div class="flex justify-end gap-2">
        <Button
          type="button"
          :label="t('common.cancel')"
          severity="secondary"
          outlined
          :disabled="saving"
          @click="emit('update:visible', false)"
        />
        <Button
          type="submit"
          :label="t('common.save')"
          icon="pi pi-check"
          :loading="saving"
          data-testid="save-promo-code"
        />
      </div>
    </form>
  </Dialog>
</template>
