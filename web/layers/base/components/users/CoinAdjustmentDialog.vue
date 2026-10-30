<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AppUser, Wallet } from '../../types/api'
import { COIN_BUCKETS } from '../../types/api'
import { useUsersApi } from '../../composables/useUsersApi'
import { useNotify } from '../../composables/useNotify'
import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_REASON_MAX,
  ADJUSTMENT_REASON_MIN,
  adjustmentPreview,
  adjustmentToInput,
  emptyAdjustmentForm,
  signedAmount,
  userErrorKey,
  userLabel,
  validateAdjustment,
  type AdjustmentFormErrors,
} from '../../utils/users'

/**
 * « Créditer / Débiter des pièces » (B-09): amount ±, bucket, mandatory reason (≥ 10 chars),
 * preview of the resulting balance, confirmation; the server stays the source of truth.
 */
const props = defineProps<{
  visible: boolean
  user: AppUser
  wallet: Wallet
  bonusValidityDays?: number
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  adjusted: [wallet: Wallet]
}>()

const { t, n } = useI18n()
const api = useUsersApi()
const notify = useNotify()
const confirm = useConfirm()

const form = ref(emptyAdjustmentForm())
const errors = ref<AdjustmentFormErrors>({})
const submitted = ref(false)
const saving = ref(false)

const directionOptions = computed(() => [
  { value: 'credit', label: t('users.adjust.credit'), icon: 'pi pi-plus' },
  { value: 'debit', label: t('users.adjust.debit'), icon: 'pi pi-minus' },
])
const bucketOptions = COIN_BUCKETS.map((value) => ({ value, label: t(`users.bucket.${value}`) }))

const preview = computed(() => adjustmentPreview(props.wallet, form.value))
const delta = computed(() => signedAmount(form.value))
const reasonLength = computed(() => form.value.reason.trim().length)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = emptyAdjustmentForm()
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateAdjustment(values, props.wallet)
  },
  { deep: true },
)

function errorMessage(key: keyof AdjustmentFormErrors): string | undefined {
  const code = errors.value[key]
  return code
    ? t(code, { max: key === 'reason' ? ADJUSTMENT_REASON_MAX : ADJUSTMENT_MAX, min: 1 })
    : undefined
}

function askConfirm(): void {
  submitted.value = true
  errors.value = validateAdjustment(form.value, props.wallet)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  const params = {
    amount: n(Math.abs(delta.value)),
    bucket: t(`users.bucket.${form.value.bucket}`),
    user: userLabel(props.user),
    total: n(preview.value.total),
  }
  confirm.require({
    header: t('users.adjust.confirmHeader'),
    message: t(
      form.value.direction === 'debit' ? 'users.adjust.confirmDebit' : 'users.adjust.confirmCredit',
      params,
    ),
    icon: form.value.direction === 'debit' ? 'pi pi-minus-circle' : 'pi pi-plus-circle',
    acceptLabel: t(form.value.direction === 'debit' ? 'users.adjust.debit' : 'users.adjust.credit'),
    rejectLabel: t('common.cancel'),
    acceptProps: form.value.direction === 'debit' ? { severity: 'danger' } : undefined,
    accept: () => void save(),
  })
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const wallet = await api.adjustCoins(props.user.id, adjustmentToInput(form.value))
    notify.success(t('users.adjust.done', { total: n(wallet.total) }), t('monetization.audited'))
    emit('adjusted', wallet)
    emit('update:visible', false)
  } catch (err) {
    const key = userErrorKey(err)
    if (key) notify.error(t('users.adjust.failed'), t(key))
    else notify.apiError(err, t('users.adjust.failed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="t('users.adjust.title')"
    :style="{ width: 'min(36rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form
      class="flex flex-col gap-4"
      novalidate
      data-testid="adjust-form"
      @submit.prevent="askConfirm"
    >
      <p class="text-sm text-muted-color">{{ t('users.adjust.hint') }}</p>

      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t('users.adjust.direction') }}</span>
        <SelectButton
          v-model="form.direction"
          :options="directionOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :disabled="saving"
          :aria-label="t('users.adjust.direction')"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="adjust-amount" class="text-sm font-medium">{{
            t('users.adjust.amount')
          }}</label>
          <InputNumber
            v-model="form.amount"
            input-id="adjust-amount"
            :min="0"
            :max="ADJUSTMENT_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.amount)"
            :disabled="saving"
            autofocus
            fluid
          />
          <small v-if="errors.amount" class="text-xs text-red-600">{{
            errorMessage('amount')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="adjust-bucket" class="text-sm font-medium">{{
            t('users.adjust.bucket')
          }}</label>
          <Select
            v-model="form.bucket"
            input-id="adjust-bucket"
            :options="bucketOptions"
            option-label="label"
            option-value="value"
            :disabled="saving"
            fluid
          />
          <small class="text-xs text-muted-color">{{
            t('users.adjust.bucketHint', { days: bonusValidityDays ?? 30 })
          }}</small>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label for="adjust-reason" class="text-sm font-medium">{{
          t('users.adjust.reason')
        }}</label>
        <Textarea
          id="adjust-reason"
          v-model="form.reason"
          rows="3"
          :maxlength="ADJUSTMENT_REASON_MAX"
          :placeholder="t('users.adjust.reasonPlaceholder')"
          :invalid="Boolean(errors.reason)"
          :disabled="saving"
          auto-resize
          fluid
        />
        <div class="flex justify-between text-xs">
          <small v-if="errors.reason" class="text-red-600">{{ errorMessage('reason') }}</small>
          <small v-else class="text-muted-color">{{
            t('users.adjust.reasonHint', { min: ADJUSTMENT_REASON_MIN })
          }}</small>
          <small class="tabular-nums text-muted-color"
            >{{ reasonLength }}/{{ ADJUSTMENT_REASON_MAX }}</small
          >
        </div>
      </div>

      <div class="rounded-md bg-surface-100 p-3 text-sm" data-testid="adjust-preview">
        <div class="text-xs font-medium uppercase text-muted-color">
          {{ t('users.adjust.preview') }}
        </div>
        <table class="mt-2 w-full text-right tabular-nums">
          <thead class="text-xs text-muted-color">
            <tr>
              <th class="text-left font-normal"></th>
              <th class="font-normal">{{ t('users.detail.purchased') }}</th>
              <th class="font-normal">{{ t('users.detail.bonus') }}</th>
              <th class="font-normal">{{ t('users.detail.total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-left text-muted-color">{{ t('users.adjust.current') }}</td>
              <td>{{ n(wallet.purchased) }}</td>
              <td>{{ n(wallet.bonus) }}</td>
              <td>{{ n(wallet.total) }}</td>
            </tr>
            <tr class="text-muted-color">
              <td class="text-left">{{ t('users.adjust.delta') }}</td>
              <td>
                {{ form.bucket === 'PURCHASED' && delta ? (delta > 0 ? '+' : '') + n(delta) : '—' }}
              </td>
              <td>
                {{ form.bucket === 'BONUS' && delta ? (delta > 0 ? '+' : '') + n(delta) : '—' }}
              </td>
              <td>{{ delta ? (delta > 0 ? '+' : '') + n(delta) : '—' }}</td>
            </tr>
            <tr class="font-semibold" :class="preview.negative ? 'text-red-600' : ''">
              <td class="text-left">{{ t('users.adjust.preview') }}</td>
              <td>{{ n(preview.purchased) }}</td>
              <td>{{ n(preview.bonus) }}</td>
              <td data-testid="adjust-preview-total">{{ n(preview.total) }}</td>
            </tr>
          </tbody>
        </table>
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
          :label="form.direction === 'debit' ? t('users.adjust.debit') : t('users.adjust.credit')"
          :icon="form.direction === 'debit' ? 'pi pi-minus' : 'pi pi-plus'"
          :severity="form.direction === 'debit' ? 'danger' : undefined"
          :loading="saving"
          data-testid="submit-adjust"
        />
      </div>
    </form>
  </Dialog>
</template>
