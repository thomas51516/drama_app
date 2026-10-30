<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries, Campaign } from '../../types/api'
import { CAMPAIGN_BODY_MAX, CAMPAIGN_SEGMENT_TYPES, CAMPAIGN_TITLE_MAX } from '../../types/api'
import { useCampaignsApi } from '../../composables/useCampaignsApi'
import { useNotify } from '../../composables/useNotify'
import {
  INACTIVE_DAYS_DEFAULT,
  INACTIVE_DAYS_MAX,
  INACTIVE_DAYS_MIN,
  bodyRemaining,
  campaignFormToInput,
  campaignToForm,
  emptyCampaignForm,
  segmentNeedsCountries,
  segmentNeedsInactiveDays,
  segmentNeedsSeries,
  seriesDeepLink,
  seriesIdFromDeepLink,
  validateCampaignForm,
  type CampaignFormErrors,
} from '../../utils/campaigns'

/** Create / edit dialog of a push campaign (B-10): segment-dependent fields, Lomé schedule. */
const props = defineProps<{
  visible: boolean
  campaign: Campaign | null
  seriesById: Record<string, AdminSeries>
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [campaign: Campaign]
  resolved: [series: AdminSeries]
}>()

const { t } = useI18n()
const api = useCampaignsApi()
const notify = useNotify()

const form = ref(emptyCampaignForm())
const errors = ref<CampaignFormErrors>({})
const submitted = ref(false)
const saving = ref(false)
/** Series picked in the deep-link helper (separate from the segment series). */
const deepLinkSeriesId = ref<string | null>(null)

const isEdit = computed(() => props.campaign !== null)
const title = computed(() => (isEdit.value ? t('campaigns.edit') : t('campaigns.create')))
const segmentOptions = CAMPAIGN_SEGMENT_TYPES.map((value) => ({
  value,
  label: t(`campaigns.segments.types.${value}`),
}))
const needsCountries = computed(() => segmentNeedsCountries(form.value.segmentType))
const needsSeries = computed(() => segmentNeedsSeries(form.value.segmentType))
const needsInactiveDays = computed(() => segmentNeedsInactiveDays(form.value.segmentType))

const remaining = computed(() => bodyRemaining(form.value.body))
const counterLabel = computed(() =>
  remaining.value >= 0
    ? t('campaigns.form.bodyCounter', { remaining: remaining.value }, remaining.value)
    : t('campaigns.form.bodyOver', { over: -remaining.value }, -remaining.value),
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.campaign ? campaignToForm(props.campaign) : emptyCampaignForm()
    deepLinkSeriesId.value = seriesIdFromDeepLink(form.value.deepLink)
    errors.value = {}
    submitted.value = false
  },
)

watch(
  () => form.value.segmentType,
  (type) => {
    if (segmentNeedsInactiveDays(type) && form.value.inactiveDays === null) {
      form.value.inactiveDays = INACTIVE_DAYS_DEFAULT
    }
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateCampaignForm(values)
  },
  { deep: true },
)

function onDeepLinkSeries(series: AdminSeries): void {
  emit('resolved', series)
  deepLinkSeriesId.value = series.id
  form.value.deepLink = seriesDeepLink(series.id)
}

function onDeepLinkInput(): void {
  deepLinkSeriesId.value = seriesIdFromDeepLink(form.value.deepLink)
}

function errorMessage(key: keyof CampaignFormErrors): string | undefined {
  const code = errors.value[key]
  if (!code) return undefined
  const max =
    key === 'title'
      ? CAMPAIGN_TITLE_MAX
      : key === 'inactiveDays'
        ? INACTIVE_DAYS_MAX
        : CAMPAIGN_BODY_MAX
  return t(code, { max, min: INACTIVE_DAYS_MIN, value: '' })
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateCampaignForm(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  saving.value = true
  try {
    const input = campaignFormToInput(form.value)
    const saved = props.campaign
      ? await api.updateCampaign(props.campaign.id, input)
      : await api.createCampaign(input)
    notify.success(t(isEdit.value ? 'campaigns.toasts.saved' : 'campaigns.toasts.created'))
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('campaigns.toasts.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="title"
    :style="{ width: 'min(42rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="campaign-title" class="text-sm font-medium">{{
          t('campaigns.form.title')
        }}</label>
        <InputText
          id="campaign-title"
          v-model="form.title"
          :maxlength="CAMPAIGN_TITLE_MAX"
          :invalid="Boolean(errors.title)"
          :disabled="saving"
          fluid
        />
        <small v-if="errors.title" class="text-red-600">{{ errorMessage('title') }}</small>
        <small v-else class="text-xs text-muted-color">{{ t('campaigns.form.titleHint') }}</small>
      </div>

      <div class="flex flex-col gap-1">
        <label for="campaign-body" class="text-sm font-medium">{{
          t('campaigns.form.body')
        }}</label>
        <Textarea
          id="campaign-body"
          v-model="form.body"
          rows="3"
          auto-resize
          :invalid="Boolean(errors.body)"
          :disabled="saving"
          fluid
        />
        <div class="flex items-start justify-between gap-3">
          <small v-if="errors.body" class="text-red-600">{{ errorMessage('body') }}</small>
          <span v-else />
          <small
            class="shrink-0 text-xs tabular-nums"
            :class="remaining < 0 ? 'font-medium text-red-600' : 'text-muted-color'"
            data-testid="body-counter"
            aria-live="polite"
          >
            {{ counterLabel }}
          </small>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label for="campaign-deeplink" class="text-sm font-medium">
          {{ t('campaigns.form.deepLink') }}
          <span class="font-normal text-muted-color">({{ t('common.optional') }})</span>
        </label>
        <InputText
          id="campaign-deeplink"
          v-model="form.deepLink"
          placeholder="drama://series/{id}"
          class="font-mono"
          :invalid="Boolean(errors.deepLink)"
          :disabled="saving"
          fluid
          @input="onDeepLinkInput"
        />
        <div class="mt-1 flex flex-col gap-1">
          <label for="campaign-deeplink-series" class="text-xs text-muted-color">{{
            t('campaigns.form.deepLinkUseSeries')
          }}</label>
          <FeaturedSeriesPicker
            v-model="deepLinkSeriesId"
            input-id="campaign-deeplink-series"
            :series-by-id="seriesById"
            :placeholder="t('campaigns.form.deepLinkSeries')"
            :disabled="saving"
            @select="onDeepLinkSeries"
          />
        </div>
        <small v-if="errors.deepLink" class="text-red-600">{{ errorMessage('deepLink') }}</small>
        <small v-else class="text-xs text-muted-color">{{
          t('campaigns.form.deepLinkHint')
        }}</small>
      </div>

      <fieldset class="flex flex-col gap-3 rounded-md border border-surface-200 p-4">
        <legend class="px-1 text-sm font-medium">{{ t('campaigns.form.segment') }}</legend>
        <Select
          v-model="form.segmentType"
          input-id="campaign-segment"
          :options="segmentOptions"
          option-label="label"
          option-value="value"
          :disabled="saving"
          fluid
        />

        <div v-if="needsCountries" class="flex flex-col gap-1">
          <label for="campaign-countries" class="text-sm font-medium">{{
            t('campaigns.form.countries')
          }}</label>
          <CatalogueTerritoriesInput
            v-model="form.countries"
            input-id="campaign-countries"
            :disabled="saving"
            :invalid="Boolean(errors.countries)"
          />
          <small v-if="errors.countries" class="text-red-600">{{
            errorMessage('countries')
          }}</small>
        </div>

        <div v-if="needsSeries" class="flex flex-col gap-1">
          <label for="campaign-series" class="text-sm font-medium">{{
            t('campaigns.form.series')
          }}</label>
          <FeaturedSeriesPicker
            v-model="form.seriesId"
            input-id="campaign-series"
            :series-by-id="seriesById"
            :disabled="saving"
            :invalid="Boolean(errors.seriesId)"
            @select="emit('resolved', $event)"
          />
          <small v-if="errors.seriesId" class="text-red-600">{{ errorMessage('seriesId') }}</small>
        </div>

        <div v-if="needsInactiveDays" class="flex flex-col gap-1">
          <label for="campaign-inactive-days" class="text-sm font-medium">{{
            t('campaigns.form.inactiveDays')
          }}</label>
          <InputNumber
            v-model="form.inactiveDays"
            input-id="campaign-inactive-days"
            :min="INACTIVE_DAYS_MIN"
            :max="INACTIVE_DAYS_MAX"
            show-buttons
            :invalid="Boolean(errors.inactiveDays)"
            :disabled="saving"
            class="w-40"
          />
          <small v-if="errors.inactiveDays" class="text-red-600">{{
            errorMessage('inactiveDays')
          }}</small>
          <small v-else class="text-xs text-muted-color">{{
            t('campaigns.form.inactiveDaysHint')
          }}</small>
        </div>
      </fieldset>

      <div class="flex flex-col gap-1">
        <label for="campaign-scheduled-at" class="text-sm font-medium">
          {{ t('campaigns.form.schedule') }}
          <span class="font-normal text-muted-color">({{ t('common.optional') }})</span>
        </label>
        <div class="flex items-center gap-2">
          <DatePicker
            v-model="form.scheduledAt"
            input-id="campaign-scheduled-at"
            show-time
            hour-format="24"
            show-icon
            date-format="dd/mm/yy"
            :step-minute="5"
            :min-date="new Date()"
            :disabled="saving"
            class="flex-1"
            fluid
          />
          <Button
            v-if="form.scheduledAt"
            type="button"
            icon="pi pi-calendar-times"
            severity="secondary"
            text
            :aria-label="t('campaigns.form.scheduleClear')"
            :title="t('campaigns.form.scheduleClear')"
            @click="form.scheduledAt = null"
          />
        </div>
        <small class="text-xs text-muted-color">{{ t('campaigns.form.scheduleHint') }}</small>
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
        <Button type="submit" :label="t('common.save')" icon="pi pi-check" :loading="saving" />
      </div>
    </form>
  </Dialog>
</template>
