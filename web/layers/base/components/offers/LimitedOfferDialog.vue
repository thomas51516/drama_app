<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoinPackAdmin, LimitedOffer } from '../../types/api'
import { useOffersApi } from '../../composables/useOffersApi'
import { useNotify } from '../../composables/useNotify'
import {
  BONUS_PERCENT_MAX,
  OFFER_TITLE_MAX,
  bonusFromPercent,
  emptyLimitedOfferForm,
  limitedOfferToForm,
  limitedOfferToInput,
  validateLimitedOffer,
  type LimitedOfferErrors,
} from '../../utils/offers'
import { fromPickerDate, toPickerDate } from '../../utils/schedule'

/** Create / edit a limited offer. Dates are entered in Lomé time and sent as UTC (B-04 rules). */
const props = defineProps<{
  visible: boolean
  offer: LimitedOffer | null
  packs: readonly CoinPackAdmin[]
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; saved: [offer: LimitedOffer] }>()

const { t, n } = useI18n()
const api = useOffersApi()
const notify = useNotify()

const form = ref(emptyLimitedOfferForm())
const startsAtPicker = ref<Date | null>(null)
const endsAtPicker = ref<Date | null>(null)
const errors = ref<LimitedOfferErrors>({})
const submitted = ref(false)
const saving = ref(false)

const isEdit = computed(() => props.offer !== null)
const pack = computed(() => props.packs.find((item) => item.sku === form.value.packSku) ?? null)
const bonusCoins = computed(() =>
  pack.value ? bonusFromPercent(pack.value.coins, form.value.bonusPercent ?? 0) : 0,
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.offer ? limitedOfferToForm(props.offer) : emptyLimitedOfferForm()
    startsAtPicker.value = toPickerDate(form.value.startsAt)
    endsAtPicker.value = toPickerDate(form.value.endsAt)
    errors.value = {}
    submitted.value = false
  },
)

watch(startsAtPicker, (value) => {
  form.value.startsAt = fromPickerDate(value)
})
watch(endsAtPicker, (value) => {
  form.value.endsAt = fromPickerDate(value)
})
watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateLimitedOffer(values)
  },
  { deep: true },
)

function errorMessage(key: keyof LimitedOfferErrors): string | undefined {
  const code = errors.value[key]
  return code
    ? t(code, { max: key === 'title' ? OFFER_TITLE_MAX : BONUS_PERCENT_MAX, min: 1 })
    : undefined
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateLimitedOffer(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  const input = limitedOfferToInput(form.value, props.offer ?? undefined)
  if (props.offer && Object.keys(input).length === 0) {
    emit('update:visible', false)
    return
  }
  saving.value = true
  try {
    const saved = props.offer
      ? await api.updateLimited(props.offer.id, input)
      : await api.createLimited(input)
    notify.success(
      props.offer ? t('offers.limited.saved') : t('offers.limited.created', { title: saved.title }),
      t('monetization.audited'),
    )
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('offers.limited.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="isEdit ? t('offers.limited.edit') : t('offers.limited.create')"
    :style="{ width: 'min(40rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form
      class="flex flex-col gap-5"
      novalidate
      data-testid="limited-offer-form"
      @submit.prevent="save"
    >
      <div class="flex flex-col gap-1">
        <label for="offer-title" class="text-sm font-medium">{{
          t('offers.limited.columns.title')
        }}</label>
        <InputText
          id="offer-title"
          v-model="form.title"
          :maxlength="OFFER_TITLE_MAX"
          :invalid="Boolean(errors.title)"
          :disabled="saving"
          :placeholder="t('offers.limited.titlePlaceholder')"
          fluid
        />
        <small v-if="errors.title" class="text-xs text-red-600">{{ errorMessage('title') }}</small>
      </div>

      <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div class="flex flex-col gap-1">
          <label for="offer-pack" class="text-sm font-medium">{{
            t('offers.limited.columns.pack')
          }}</label>
          <OffersPackPicker
            v-model="form.packSku"
            input-id="offer-pack"
            :packs="packs"
            :invalid="Boolean(errors.packSku)"
            :disabled="saving"
          />
          <small v-if="errors.packSku" class="text-xs text-red-600">{{
            errorMessage('packSku')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="offer-percent" class="text-sm font-medium">{{
            t('offers.form.bonusPercent')
          }}</label>
          <InputNumber
            v-model="form.bonusPercent"
            input-id="offer-percent"
            :min="1"
            :max="BONUS_PERCENT_MAX"
            suffix=" %"
            :use-grouping="false"
            :invalid="Boolean(errors.bonusPercent)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.bonusPercent" class="text-xs text-red-600">{{
            errorMessage('bonusPercent')
          }}</small>
        </div>
      </div>

      <p v-if="pack" class="text-sm" data-testid="offer-preview">
        {{
          t('offers.limited.preview', {
            sku: pack.sku,
            coins: n(pack.coins),
            bonus: n(pack.bonusCoins + bonusCoins),
          })
        }}
      </p>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="offer-starts" class="text-sm font-medium">{{
            t('offers.form.startsAt')
          }}</label>
          <DatePicker
            v-model="startsAtPicker"
            input-id="offer-starts"
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
          <small v-else class="text-xs text-muted-color">{{ t('offers.form.startsAtHint') }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="offer-ends" class="text-sm font-medium">{{ t('offers.form.endsAt') }}</label>
          <DatePicker
            v-model="endsAtPicker"
            input-id="offer-ends"
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
        <ToggleSwitch v-model="form.isActive" input-id="offer-active" :disabled="saving" />
        <label for="offer-active" class="text-sm">{{ t('monetization.form.active') }}</label>
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
          data-testid="save-limited-offer"
        />
      </div>
    </form>
  </Dialog>
</template>
