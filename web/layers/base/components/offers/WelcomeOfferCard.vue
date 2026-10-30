<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoinPackAdmin, WelcomeOffer } from '../../types/api'
import { useOffersApi } from '../../composables/useOffersApi'
import { useNotify } from '../../composables/useNotify'
import {
  BONUS_PERCENT_MAX,
  WELCOME_HOURS_MAX,
  bonusFromPercent,
  defaultWelcomeOffer,
  sameWelcomeOffer,
  validateWelcomeOffer,
  welcomeFormToInput,
  welcomeToForm,
  type WelcomeOfferErrors,
} from '../../utils/offers'

/** Welcome offer (M-24): bonus % on the first purchase during N hours after sign-up. */
const props = defineProps<{ packs: readonly CoinPackAdmin[] }>()
const { t, n } = useI18n()
const api = useOffersApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-offers-welcome', () =>
  api.getWelcome(),
)
const saved = ref<WelcomeOffer>(data.value ?? defaultWelcomeOffer())
const form = ref(welcomeToForm(saved.value))
watch(data, (value) => {
  saved.value = value ?? defaultWelcomeOffer()
  form.value = welcomeToForm(saved.value)
})

const errors = ref<WelcomeOfferErrors>({})
const saving = ref(false)

const current = computed(() => welcomeFormToInput(form.value))
const dirty = computed(() => !sameWelcomeOffer(current.value, saved.value))

/** Example on the pack the offer targets (or the first pack) for the live preview. */
const examplePack = computed(
  () =>
    props.packs.find((pack) => pack.sku === form.value.packSku) ??
    props.packs.find((pack) => pack.isActive) ??
    null,
)
const exampleBonus = computed(() =>
  examplePack.value ? bonusFromPercent(examplePack.value.coins, form.value.bonusPercent ?? 0) : 0,
)

watch(
  form,
  () => {
    if (Object.keys(errors.value).length > 0) errors.value = validateWelcomeOffer(form.value)
  },
  { deep: true },
)

function errorMessage(key: keyof WelcomeOfferErrors): string | undefined {
  const code = errors.value[key]
  return code
    ? t(code, { max: key === 'hours' ? WELCOME_HOURS_MAX : BONUS_PERCENT_MAX, min: 1 })
    : undefined
}

function reset(): void {
  form.value = welcomeToForm(saved.value)
  errors.value = {}
}

function askSave(): void {
  errors.value = validateWelcomeOffer(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  if (!dirty.value) {
    notify.info(t('offers.welcome.nothingToSave'))
    return
  }
  confirm.require({
    header: t('offers.welcome.confirmHeader'),
    message: current.value.isActive
      ? t('offers.welcome.confirmActive', {
          percent: current.value.bonusPercent,
          hours: current.value.hours,
        })
      : t('offers.welcome.confirmInactive'),
    icon: 'pi pi-gift',
    acceptLabel: t('common.save'),
    rejectLabel: t('common.cancel'),
    accept: () => void save(),
  })
}

async function save(): Promise<void> {
  saving.value = true
  try {
    saved.value = await api.updateWelcome(current.value)
    form.value = welcomeToForm(saved.value)
    notify.success(t('offers.welcome.saved'), t('monetization.audited'))
  } catch (err) {
    notify.apiError(err, t('offers.welcome.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section
    class="rounded-lg border border-surface-200 bg-surface-0 p-5"
    data-testid="welcome-offer-card"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('offers.welcome.title') }}</h2>
        <p class="mt-1 text-sm text-muted-color">{{ t('offers.welcome.hint') }}</p>
      </div>
      <Tag
        :value="saved.isActive ? t('offers.state.live') : t('offers.state.inactive')"
        :severity="saved.isActive ? 'success' : 'contrast'"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mt-4">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('offers.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <form
      v-else
      class="mt-5 grid gap-5 lg:grid-cols-[1fr_16rem]"
      novalidate
      @submit.prevent="askSave"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex items-start gap-3 sm:col-span-2">
          <ToggleSwitch
            v-model="form.isActive"
            input-id="welcome-active"
            :disabled="saving || status === 'pending'"
          />
          <div>
            <label for="welcome-active" class="text-sm font-medium">{{
              t('offers.welcome.active')
            }}</label>
            <p class="text-xs text-muted-color">{{ t('offers.welcome.activeHint') }}</p>
          </div>
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for="welcome-pack" class="text-sm font-medium">{{
            t('offers.welcome.pack')
          }}</label>
          <OffersPackPicker
            v-model="form.packSku"
            input-id="welcome-pack"
            :packs="packs"
            allow-all
            :disabled="saving"
          />
          <small class="text-xs text-muted-color">{{ t('offers.welcome.packHint') }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="welcome-percent" class="text-sm font-medium">{{
            t('offers.form.bonusPercent')
          }}</label>
          <InputNumber
            v-model="form.bonusPercent"
            input-id="welcome-percent"
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
        <div class="flex flex-col gap-1">
          <label for="welcome-hours" class="text-sm font-medium">{{
            t('offers.welcome.hours')
          }}</label>
          <InputNumber
            v-model="form.hours"
            input-id="welcome-hours"
            :min="1"
            :max="WELCOME_HOURS_MAX"
            :suffix="` ${t('offers.welcome.hoursUnit')}`"
            :use-grouping="false"
            :invalid="Boolean(errors.hours)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.hours" class="text-xs text-red-600">{{
            errorMessage('hours')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{ t('offers.welcome.hoursHint') }}</small>
        </div>
        <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button
            type="button"
            :label="t('offers.form.reset')"
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
            data-testid="save-welcome"
          />
        </div>
      </div>

      <!-- Preview of what the app shows on the first purchase -->
      <aside
        class="rounded-lg bg-surface-100 p-4 text-sm"
        :aria-label="t('offers.welcome.preview')"
      >
        <div class="text-xs font-semibold uppercase text-muted-color">
          {{ t('offers.welcome.preview') }}
        </div>
        <template v-if="examplePack">
          <p class="mt-2 font-medium">{{ examplePack.sku }}</p>
          <p class="tabular-nums">
            {{ n(examplePack.coins) }} {{ t('series.form.coins') }}
            <span class="text-primary"> +{{ n(examplePack.bonusCoins + exampleBonus) }}</span>
          </p>
          <p class="mt-1 text-xs text-muted-color">
            {{
              t('offers.welcome.previewHint', {
                bonus: n(exampleBonus),
                percent: form.bonusPercent ?? 0,
                hours: form.hours ?? 0,
              })
            }}
          </p>
        </template>
        <p v-else class="mt-2 text-xs text-muted-color">{{ t('offers.packs.none') }}</p>
      </aside>
    </form>
  </section>
</template>
