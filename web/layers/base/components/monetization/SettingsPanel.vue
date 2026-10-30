<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MonetizationSettings } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import {
  SETTINGS_LIMITS,
  settingsPatch,
  validateSettings,
  type SettingsErrors,
} from '../../utils/monetization'

/** Settings tab (B-06): default free episodes, coin cost, discount, ad cap, auto-unlock, bonus validity. */
const { t } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-monetization-settings', () =>
  api.getSettings(),
)
const saved = ref<MonetizationSettings | null>(data.value ?? null)
const form = ref<MonetizationSettings | null>(data.value ? { ...data.value } : null)
watch(data, (value) => {
  if (!value) return
  saved.value = value
  form.value = { ...value }
})

const errors = ref<SettingsErrors>({})
const saving = ref(false)

const patch = computed(() =>
  saved.value && form.value ? settingsPatch(saved.value, form.value) : {},
)
const changedKeys = computed(() => Object.keys(patch.value) as (keyof MonetizationSettings)[])
const dirty = computed(() => changedKeys.value.length > 0)

watch(
  form,
  (values) => {
    if (values && Object.keys(errors.value).length > 0) errors.value = validateSettings(values)
  },
  { deep: true },
)

type NumericKey = keyof typeof SETTINGS_LIMITS
const numericFields: NumericKey[] = [
  'defaultFreeEpisodes',
  'defaultCoinCost',
  'seriesUnlockDiscountPercent',
  'adDailyCap',
  'bonusValidityDays',
]

function errorMessage(key: keyof MonetizationSettings): string | undefined {
  const code = errors.value[key]
  if (!code) return undefined
  const limits = key in SETTINGS_LIMITS ? SETTINGS_LIMITS[key as NumericKey] : { min: 0, max: 0 }
  return t(code, { min: limits.min, max: limits.max })
}

function reset(): void {
  if (saved.value) form.value = { ...saved.value }
  errors.value = {}
}

function askSave(): void {
  if (!form.value) return
  errors.value = validateSettings(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  if (!dirty.value) {
    notify.info(t('monetization.settings.nothingToSave'))
    return
  }
  const fields = changedKeys.value.map((key) => t(`monetization.settings.${key}`)).join(', ')
  confirm.require({
    header: t('monetization.settings.confirmHeader'),
    message: `${t('monetization.settings.confirmMessage', { count: changedKeys.value.length }, changedKeys.value.length)} ${t('monetization.settings.changed', { fields })}`,
    icon: 'pi pi-wallet',
    acceptLabel: t('common.save'),
    rejectLabel: t('common.cancel'),
    accept: () => void save(),
  })
}

async function save(): Promise<void> {
  if (!form.value) return
  saving.value = true
  try {
    const result = await api.updateSettings({ ...form.value })
    saved.value = result
    form.value = { ...result }
    notify.success(t('monetization.settings.saved'), t('monetization.audited'))
  } catch (err) {
    notify.apiError(err, t('monetization.settings.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="monetization-settings">
    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('monetization.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <div v-else-if="status === 'pending' && !form" class="flex items-center gap-2 py-8">
      <ProgressSpinner style="width: 1.5rem; height: 1.5rem" stroke-width="6" />
      <span class="text-sm text-muted-color">{{ t('common.loading') }}</span>
    </div>

    <form
      v-else-if="form"
      class="rounded-lg border border-surface-200 bg-surface-0 p-5"
      novalidate
      @submit.prevent="askSave"
    >
      <h2 class="text-lg font-semibold">{{ t('monetization.settings.title') }}</h2>
      <p class="mt-1 text-sm text-muted-color">{{ t('monetization.settings.hint') }}</p>

      <div class="mt-5 grid gap-5 md:grid-cols-2">
        <div v-for="key in numericFields" :key="key" class="flex flex-col gap-1">
          <label :for="`setting-${key}`" class="text-sm font-medium">{{
            t(`monetization.settings.${key}`)
          }}</label>
          <InputNumber
            v-model="form[key]"
            :input-id="`setting-${key}`"
            :min="SETTINGS_LIMITS[key].min"
            :max="SETTINGS_LIMITS[key].max"
            :use-grouping="false"
            :invalid="Boolean(errors[key])"
            :disabled="saving"
            show-buttons
            fluid
          />
          <small v-if="errors[key]" class="text-xs text-red-600">{{ errorMessage(key) }}</small>
          <small v-else class="text-xs text-muted-color">{{
            t(`monetization.settings.${key}Hint`)
          }}</small>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">{{
            t('monetization.settings.autoUnlockDefault')
          }}</span>
          <div class="flex items-center gap-3 py-2">
            <ToggleSwitch
              v-model="form.autoUnlockDefault"
              input-id="setting-autoUnlockDefault"
              :disabled="saving"
            />
            <label for="setting-autoUnlockDefault" class="text-sm">{{
              form.autoUnlockDefault ? t('common.yes') : t('common.no')
            }}</label>
          </div>
          <small class="text-xs text-muted-color">{{
            t('monetization.settings.autoUnlockDefaultHint')
          }}</small>
        </div>
      </div>

      <Message severity="secondary" :closable="false" size="small" class="mt-5">
        <i class="pi pi-history mr-2" aria-hidden="true" />{{ t('monetization.audited') }}
      </Message>

      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          :label="t('monetization.settings.reset')"
          severity="secondary"
          outlined
          :disabled="!dirty || saving"
          @click="reset"
        />
        <Button
          type="submit"
          :label="t('common.save')"
          icon="pi pi-check"
          :loading="saving"
          :disabled="!dirty"
          data-testid="save-settings"
        />
      </div>
    </form>
  </section>
</template>
