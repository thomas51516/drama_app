<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoinPackAdmin } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import { ApiError } from '../../utils/api-error'
import {
  BADGE_MAX,
  COINS_MAX,
  emptyPackForm,
  packFormToInput,
  packToForm,
  validatePackForm,
  type PackFormErrors,
} from '../../utils/monetization'

/** Create / edit a coin pack (B-06). The sku is immutable once created. */
const props = defineProps<{
  visible: boolean
  pack: CoinPackAdmin | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [pack: CoinPackAdmin]
}>()

const { t, n } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()

const form = ref(emptyPackForm())
const errors = ref<PackFormErrors>({})
const submitted = ref(false)
const saving = ref(false)

const isEdit = computed(() => props.pack !== null)
const total = computed(() => (form.value.coins ?? 0) + (form.value.bonusCoins ?? 0))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.pack ? packToForm(props.pack) : emptyPackForm()
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validatePackForm(values, isEdit.value)
  },
  { deep: true },
)

function errorMessage(key: keyof PackFormErrors): string | undefined {
  const code = errors.value[key]
  return code ? t(code, { max: key === 'badge' ? BADGE_MAX : COINS_MAX, min: 1 }) : undefined
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validatePackForm(form.value, isEdit.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  const input = packFormToInput(form.value, props.pack ?? undefined)
  if (props.pack && Object.keys(input).length === 0) {
    emit('update:visible', false)
    return
  }
  saving.value = true
  try {
    const saved = props.pack
      ? await api.updatePack(props.pack.id, input)
      : await api.createPack(input)
    notify.success(
      props.pack
        ? t('monetization.toasts.packSaved')
        : t('monetization.toasts.packCreated', { sku: saved.sku }),
    )
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    if (ApiError.is(err) && err.code === 'SKU_ALREADY_USED') {
      errors.value = { ...errors.value, sku: 'monetization.toasts.skuTaken' }
      notify.error(t('monetization.toasts.saveFailed'), t('monetization.toasts.skuTaken'))
    } else if (ApiError.is(err) && err.code === 'SKU_IMMUTABLE') {
      notify.error(t('monetization.toasts.saveFailed'), t('monetization.toasts.skuImmutable'))
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
    :header="isEdit ? t('monetization.packs.edit') : t('monetization.packs.create')"
    :style="{ width: 'min(52rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="flex flex-col gap-5" novalidate data-testid="pack-form" @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="pack-sku" class="text-sm font-medium">{{ t('monetization.form.sku') }}</label>
        <InputText
          id="pack-sku"
          v-model="form.sku"
          :disabled="saving || isEdit"
          :invalid="Boolean(errors.sku)"
          placeholder="coins_300"
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
          <label for="pack-coins" class="text-sm font-medium">{{
            t('monetization.form.coins')
          }}</label>
          <InputNumber
            v-model="form.coins"
            input-id="pack-coins"
            :min="0"
            :max="COINS_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.coins)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.coins" class="text-xs text-red-600">{{
            errorMessage('coins')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="pack-bonus" class="text-sm font-medium">{{
            t('monetization.form.bonusCoins')
          }}</label>
          <InputNumber
            v-model="form.bonusCoins"
            input-id="pack-bonus"
            :min="0"
            :max="COINS_MAX"
            :use-grouping="false"
            :invalid="Boolean(errors.bonusCoins)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.bonusCoins" class="text-xs text-red-600">{{
            errorMessage('bonusCoins')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{
            t('monetization.form.bonusHint')
          }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="pack-badge" class="text-sm font-medium"
            >{{ t('monetization.form.badge') }}
            <span class="font-normal text-muted-color">({{ t('common.optional') }})</span></label
          >
          <InputText
            id="pack-badge"
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

      <p class="text-sm font-medium" data-testid="pack-total">
        {{ t('monetization.form.total', { total: n(total) }) }}
      </p>

      <MonetizationPricesEditor
        v-model="form.prices"
        :disabled="saving"
        :error="errorMessage('prices')"
      />

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isActive" input-id="pack-active" :disabled="saving" />
        <label for="pack-active" class="text-sm">{{ t('monetization.form.active') }}</label>
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
          data-testid="save-pack"
        />
      </div>
    </form>
  </Dialog>
</template>
