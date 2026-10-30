<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CheckinScale } from '../../types/api'
import { CHECKIN_DAYS } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import {
  CHECKIN_DAY_MAX,
  checkinTotal,
  defaultCheckinScale,
  hasCheckinErrors,
  normalizeCheckinDays,
  sameCheckinScale,
  validateCheckinScale,
  type CheckinErrors,
} from '../../utils/rewards'

/** Check-in tab (B-08): the 7-day scale with a live total, `resetOnMiss` and a phone-like preview. */
const { t, n } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-rewards-checkin', () =>
  api.getCheckinScale(),
)
const { data: settings } = useAsyncData('admin-monetization-settings-for-rewards', () =>
  api.getSettings(),
)

function normalize(scale: CheckinScale | null | undefined): CheckinScale {
  const base = scale ?? defaultCheckinScale()
  return { days: normalizeCheckinDays(base.days), resetOnMiss: Boolean(base.resetOnMiss) }
}

const saved = ref<CheckinScale>(normalize(data.value))
const days = ref<(number | null)[]>([...saved.value.days])
const resetOnMiss = ref(saved.value.resetOnMiss)
watch(data, (value) => {
  if (!value) return
  saved.value = normalize(value)
  days.value = [...saved.value.days]
  resetOnMiss.value = saved.value.resetOnMiss
})

const errors = ref<CheckinErrors>({ days: {} })
const saving = ref(false)

const current = computed<CheckinScale>(() => ({
  days: normalizeCheckinDays(days.value),
  resetOnMiss: resetOnMiss.value,
}))
const total = computed(() => checkinTotal(days.value))
const dirty = computed(() => !sameCheckinScale(current.value, saved.value))
const bonusDays = computed(() => settings.value?.bonusValidityDays ?? 30)

watch(
  [days, resetOnMiss],
  () => {
    if (hasCheckinErrors(errors.value)) {
      errors.value = validateCheckinScale({ days: days.value, resetOnMiss: resetOnMiss.value })
    }
  },
  { deep: true },
)

function dayError(index: number): string | undefined {
  const code = errors.value.days[index]
  return code ? t(code, { max: CHECKIN_DAY_MAX }) : undefined
}

function reset(): void {
  days.value = [...saved.value.days]
  resetOnMiss.value = saved.value.resetOnMiss
  errors.value = { days: {} }
}

function askSave(): void {
  errors.value = validateCheckinScale({ days: days.value, resetOnMiss: resetOnMiss.value })
  if (hasCheckinErrors(errors.value)) {
    notify.warn(errors.value.scale ? t(errors.value.scale) : t('validation.fixErrors'))
    return
  }
  if (!dirty.value) {
    notify.info(t('rewards.checkin.nothingToSave'))
    return
  }
  confirm.require({
    header: t('rewards.checkin.confirmHeader'),
    message: t('rewards.checkin.confirmMessage', { total: n(total.value) }),
    icon: 'pi pi-gift',
    acceptLabel: t('common.save'),
    rejectLabel: t('common.cancel'),
    accept: () => void save(),
  })
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const result = normalize(await api.updateCheckinScale(current.value))
    saved.value = result
    days.value = [...result.days]
    resetOnMiss.value = result.resetOnMiss
    notify.success(t('rewards.checkin.saved'), t('monetization.audited'))
  } catch (err) {
    notify.apiError(err, t('rewards.checkin.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="checkin-editor">
    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('rewards.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <div v-else class="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <form
        class="rounded-lg border border-surface-200 bg-surface-0 p-5"
        novalidate
        @submit.prevent="askSave"
      >
        <h2 class="text-lg font-semibold">{{ t('rewards.checkin.title') }}</h2>
        <p class="mt-1 text-sm text-muted-color">{{ t('rewards.checkin.hint') }}</p>

        <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <div v-for="index in CHECKIN_DAYS" :key="index" class="flex flex-col gap-1">
            <label :for="`checkin-day-${index}`" class="text-xs font-medium text-muted-color">
              {{ t('rewards.checkin.day', { day: index }) }}
            </label>
            <InputNumber
              v-model="days[index - 1]"
              :input-id="`checkin-day-${index}`"
              :min="0"
              :max="CHECKIN_DAY_MAX"
              :use-grouping="false"
              :invalid="Boolean(errors.days[index - 1])"
              :disabled="saving || status === 'pending'"
              fluid
            />
            <small v-if="dayError(index - 1)" class="text-xs text-red-600">{{
              dayError(index - 1)
            }}</small>
          </div>
        </div>
        <small v-if="errors.scale" class="mt-2 block text-xs text-red-600">{{
          t(errors.scale)
        }}</small>

        <div
          class="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-100 p-4"
        >
          <div>
            <div class="text-xs uppercase text-muted-color">{{ t('rewards.checkin.total') }}</div>
            <div class="text-2xl font-semibold tabular-nums" data-testid="checkin-total">
              {{ t('rewards.checkin.coins', { count: n(total) }, total) }}
            </div>
            <div class="text-xs text-muted-color">
              {{ t('rewards.checkin.totalHint', { days: bonusDays }) }}
            </div>
          </div>
          <div class="flex items-start gap-3">
            <ToggleSwitch v-model="resetOnMiss" input-id="checkin-reset" :disabled="saving" />
            <div>
              <label for="checkin-reset" class="text-sm font-medium">{{
                t('rewards.checkin.resetOnMiss')
              }}</label>
              <p class="text-xs text-muted-color">{{ t('rewards.checkin.resetOnMissHint') }}</p>
            </div>
          </div>
        </div>

        <Message severity="secondary" :closable="false" size="small" class="mt-5">
          <i class="pi pi-history mr-2" aria-hidden="true" />{{ t('monetization.audited') }}
        </Message>

        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            :label="t('rewards.checkin.reset')"
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
            data-testid="save-checkin"
          />
        </div>
      </form>

      <!-- Phone-like preview: day 3 is "today" to show claimed / today / upcoming states. -->
      <div
        class="mx-auto w-full max-w-[18rem] rounded-[2rem] border-8 border-surface-900 bg-surface-950 p-3 text-surface-0"
        :aria-label="t('rewards.checkin.preview')"
      >
        <p class="text-center text-xs text-surface-400">{{ t('rewards.checkin.preview') }}</p>
        <div class="mt-3 grid grid-cols-4 gap-2">
          <div
            v-for="index in CHECKIN_DAYS"
            :key="index"
            class="flex flex-col items-center rounded-lg py-2 text-center"
            :class="[
              index < 3 ? 'bg-surface-800 opacity-70' : '',
              index === 3 ? 'bg-primary text-primary-contrast' : '',
              index > 3 ? 'bg-surface-800' : '',
              index === CHECKIN_DAYS ? 'col-span-2' : '',
            ]"
          >
            <span class="text-[0.6rem] uppercase opacity-80">
              {{
                index === 3 ? t('rewards.checkin.today') : t('rewards.checkin.day', { day: index })
              }}
            </span>
            <i
              :class="index < 3 ? 'pi pi-check-circle' : 'pi pi-circle-fill'"
              class="my-1 text-sm"
              aria-hidden="true"
            />
            <span class="text-xs font-semibold tabular-nums">+{{ n(days[index - 1] ?? 0) }}</span>
            <span v-if="index < 3" class="text-[0.55rem] opacity-80">{{
              t('rewards.checkin.claimed')
            }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
