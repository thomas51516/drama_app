<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { VipPlanAdmin } from '../../types/api'
import { VIP_PERIODS } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import { ApiError } from '../../utils/api-error'
import {
  BADGE_MAX,
  TRIAL_DAYS_MAX,
  emptyVipPlanForm,
  validateVipPlanForm,
  vipPlanFormToInput,
  vipPlanToForm,
  type VipPlanFormErrors,
} from '../../utils/monetization'

/** Create / edit a VIP plan (B-06): same pattern as the packs with a period and trial days. */
const props = defineProps<{
  visible: boolean
  plan: VipPlanAdmin | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [plan: VipPlanAdmin]
}>()

const { t } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()

const form = ref(emptyVipPlanForm())
const errors = ref<VipPlanFormErrors>({})
const submitted = ref(false)
const saving = ref(false)

const isEdit = computed(() => props.plan !== null)
const periodOptions = VIP_PERIODS.map((value) => ({
  value,
  label: t(`monetization.period.${value}`),
}))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.plan ? vipPlanToForm(props.plan) : emptyVipPlanForm()
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateVipPlanForm(values, isEdit.value)
  },
  { deep: true },
)

function errorMessage(key: keyof VipPlanFormErrors): string | undefined {
  const code = errors.value[key]
  return code ? t(code, { max: key === 'badge' ? BADGE_MAX : TRIAL_DAYS_MAX, min: 0 }) : undefined
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateVipPlanForm(form.value, isEdit.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  const input = vipPlanFormToInput(form.value, props.plan ?? undefined)
  if (props.plan && Object.keys(input).length === 0) {
    emit('update:visible', false)
    return
  }
  saving.value = true
  try {
    const saved = props.plan
      ? await api.updateVipPlan(props.plan.id, input)
      : await api.createVipPlan(input)
    notify.success(
      props.plan
        ? t('monetization.toasts.planSaved')
        : t('monetization.toasts.planCreated', { sku: saved.sku }),
    )
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    if (ApiError.is(err) && err.code === 'SKU_ALREADY_USED') {
      errors.value = { ...errors.value, sku: 'monetization.toasts.skuTaken' }
      notify.error(t('monetization.toasts.saveFailed'), t('monetization.toasts.skuTaken'))
    } else {
      notify.apiError(err, t('monetization.toasts.saveFailed'))
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
    :header="isEdit ? t('monetization.vip.edit') : t('monetization.vip.create')"
    :style="{ width: 'min(52rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="flex flex-col gap-5" novalidate data-testid="vip-form" @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="vip-sku" class="text-sm font-medium">{{ t('monetization.form.sku') }}</label>
        <InputText
          id="vip-sku"
          v-model="form.sku"
          :disabled="saving || isEdit"
          :invalid="Boolean(errors.sku)"
          placeholder="vip_month"
          class="font-mono"
          autocomplete="off"
          fluid
        />
        <small v-if="errors.sku" class="text-xs text-red-600">{{ errorMessage('sku') }}</small>
        <small v-else class="text-xs text-muted-color">{{
          isEdit ? t('monetization.form.skuLocked') : t('monetization.form.skuHint')
        }}</small>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div class="flex flex-col gap-1">
          <label for="vip-period" class="text-sm font-medium">{{
            t('monetization.form.period')
          }}</label>
          <Select
            v-model="form.period"
            input-id="vip-period"
            :options="periodOptions"
            option-label="label"
            option-value="value"
            :disabled="saving"
            :invalid="Boolean(errors.period)"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="vip-trial" class="text-sm font-medium">{{
            t('monetization.form.trialDays')
          }}</label>
          <InputNumber
            v-model="form.trialDays"
            input-id="vip-trial"
            :min="0"
            :max="TRIAL_DAYS_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.trialDays)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.trialDays" class="text-xs text-red-600">{{
            errorMessage('trialDays')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{
            t('monetization.form.trialHint')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="vip-badge" class="text-sm font-medium"
            >{{ t('monetization.form.badge') }}
            <span class="font-normal text-muted-color">({{ t('common.optional') }})</span></label
          >
          <InputText
            id="vip-badge"
            v-model="form.badge"
            :maxlength="BADGE_MAX"
            :placeholder="t('monetization.form.badgePlaceholder')"
            :invalid="Boolean(errors.badge)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.badge" class="text-xs text-red-600">{{
            errorMessage('badge')
          }}</small>
        </div>
      </div>

      <MonetizationPricesEditor
        v-model="form.prices"
        :disabled="saving"
        :error="errorMessage('prices')"
      />

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isActive" input-id="vip-active" :disabled="saving" />
        <label for="vip-active" class="text-sm">{{ t('monetization.form.active') }}</label>
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
          data-testid="save-vip"
        />
      </div>
    </form>
  </Dialog>
</template>
