<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  AGE_RATINGS,
  SERIES_GENRES,
  SERIES_LANGUAGES,
  type AdminSeries,
  type AdminSeriesUpdateInput,
} from '../../types/api'
import { formatZoned, fromPickerDate, publicationState, toPickerDate } from '../../utils/schedule'
import {
  canEditCatalogue,
  canEditMonetization,
  emptySeriesForm,
  seriesFormDiff,
  seriesFormToInput,
  seriesToForm,
  validateSeriesForm,
  SERIES_LIMITS,
  type SeriesFormErrors,
  type SeriesFormField,
  type SeriesFormValues,
} from '../../utils/series-form'

/**
 * Create / edit form of a series (B-01). Emits the API payload (full input on create, diff on
 * edit). Monetisation fields are disabled unless the role is MONETIZATION or ADMIN; catalogue
 * fields are disabled for MONETIZATION and SUPPORT.
 */
const props = defineProps<{
  series?: AdminSeries | null
  saving?: boolean
}>()
const emit = defineEmits<{ submit: [input: AdminSeriesUpdateInput] }>()

const { t, locale } = useI18n()
const auth = useAuthStore()

const values = reactive<SeriesFormValues>(
  props.series ? seriesToForm(props.series) : emptySeriesForm(),
)
const errors = ref<SeriesFormErrors>({})
const touched = reactive(new Set<SeriesFormField>())
const submitted = ref(false)

watch(
  () => props.series,
  (series) => {
    Object.assign(values, series ? seriesToForm(series) : emptySeriesForm())
    errors.value = {}
    touched.clear()
    submitted.value = false
  },
)

const role = computed(() => auth.user?.role ?? null)
const catalogueEditable = computed(() => canEditCatalogue(role.value))
const monetizationEditable = computed(() => canEditMonetization(role.value))
const readOnly = computed(() => !catalogueEditable.value && !monetizationEditable.value)
const isArchived = computed(() => props.series?.status === 'ARCHIVED')

const catalogueDisabled = computed(
  () => props.saving || !catalogueEditable.value || isArchived.value,
)
const monetizationDisabled = computed(
  () => props.saving || !monetizationEditable.value || isArchived.value,
)

const isDirty = computed(() => {
  if (!props.series) return true
  return (
    Object.keys(
      seriesFormDiff(values, props.series, { includeMonetization: monetizationEditable.value }),
    ).length > 0
  )
})

const genreOptions = SERIES_GENRES.map((genre) => ({
  value: genre,
  label: t(`series.genres.${genre}`),
}))
const languageOptions = SERIES_LANGUAGES.map((code) => ({
  value: code,
  label: t(`series.languages.${code}`),
}))
const ageRatingOptions = AGE_RATINGS.map((rating) => ({
  value: rating,
  label: t(`series.ageRatings.${rating}`),
}))

function revalidate(): void {
  errors.value = validateSeriesForm(values)
}

watch(values, revalidate, { deep: true })

function errorMessage(field: SeriesFormField): string | undefined {
  if (!submitted.value && !touched.has(field)) return undefined
  const error = errors.value[field]
  return error ? t(error.key, error.params ?? {}) : undefined
}

function touch(field: SeriesFormField): void {
  touched.add(field)
}

const tagSuggestions = ref<string[]>([])
function onTagsUpdate(next: string[]): void {
  values.tags = Array.from(new Set(next.map((tag) => tag.trim()).filter(Boolean)))
  touch('tags')
}

// --- scheduled publication (B-04): the picker shows Lomé wall time, the model keeps UTC ----
const publishedAtPicker = computed<Date | null>({
  get: () => toPickerDate(values.publishedAt),
  set: (date) => {
    values.publishedAt = fromPickerDate(date)
    touch('publishedAt')
  },
})
const publicationInfo = computed(() => {
  if (!values.publishedAt) return null
  const date = formatZoned(values.publishedAt, locale.value)
  return publicationState(values.publishedAt) === 'scheduled'
    ? t('series.form.publishedAtScheduled', { date })
    : t('series.form.publishedAtPast', { date })
})

function submit(): void {
  submitted.value = true
  revalidate()
  if (Object.keys(errors.value).length > 0) return
  const options = { includeMonetization: monetizationEditable.value }
  // A MONETIZATION user only sends the monetisation fields, an EDITOR never sends them.
  if (props.series) {
    const diff = seriesFormDiff(values, props.series, options)
    emit('submit', catalogueEditable.value ? diff : pickMonetization(diff))
  } else {
    emit('submit', seriesFormToInput(values, options))
  }
}

function pickMonetization(input: AdminSeriesUpdateInput): AdminSeriesUpdateInput {
  const picked: AdminSeriesUpdateInput = {}
  if (input.freeEpisodeCount !== undefined) picked.freeEpisodeCount = input.freeEpisodeCount
  if (input.coinCostPerEpisode !== undefined) picked.coinCostPerEpisode = input.coinCostPerEpisode
  return picked
}

defineExpose({ isDirty, submit })
</script>

<template>
  <form class="flex flex-col gap-8" novalidate @submit.prevent="submit">
    <Message v-if="readOnly" severity="info" :closable="false">
      {{ t('series.form.readOnly') }}
    </Message>
    <Message v-else-if="isArchived" severity="warn" :closable="false">
      {{ t('series.form.archivedLocked') }}
    </Message>
    <Message
      v-if="submitted && Object.keys(errors).length > 0"
      severity="error"
      :closable="false"
      role="alert"
    >
      {{ t('validation.fixErrors') }}
    </Message>

    <!-- General -->
    <fieldset class="grid gap-5 rounded-lg border border-surface-200 bg-surface-0 p-5">
      <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
        {{ t('series.form.sections.general') }}
      </legend>

      <div class="flex flex-col gap-1.5">
        <label for="series-title" class="text-sm font-medium">
          {{ t('series.form.title') }} <span aria-hidden="true">*</span>
        </label>
        <InputText
          id="series-title"
          v-model="values.title"
          :maxlength="SERIES_LIMITS.titleMax"
          :invalid="Boolean(errorMessage('title'))"
          :disabled="catalogueDisabled"
          autocomplete="off"
          fluid
          @blur="touch('title')"
        />
        <small v-if="errorMessage('title')" class="text-red-600">{{ errorMessage('title') }}</small>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="series-synopsis" class="text-sm font-medium">
          {{ t('series.form.synopsis') }} <span aria-hidden="true">*</span>
        </label>
        <Textarea
          id="series-synopsis"
          v-model="values.synopsis"
          rows="4"
          auto-resize
          :maxlength="SERIES_LIMITS.synopsisMax"
          :invalid="Boolean(errorMessage('synopsis'))"
          :disabled="catalogueDisabled"
          fluid
          @blur="touch('synopsis')"
        />
        <div class="flex justify-between text-xs text-muted-color">
          <small v-if="errorMessage('synopsis')" class="text-red-600">
            {{ errorMessage('synopsis') }}
          </small>
          <span v-else />
          <span>{{ values.synopsis.length }} / {{ SERIES_LIMITS.synopsisMax }}</span>
        </div>
      </div>

      <div class="grid gap-5 md:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <label for="series-genres" class="text-sm font-medium">
            {{ t('series.form.genres') }} <span aria-hidden="true">*</span>
          </label>
          <MultiSelect
            v-model="values.genres"
            input-id="series-genres"
            :options="genreOptions"
            option-label="label"
            option-value="value"
            display="chip"
            :placeholder="t('series.form.genresPlaceholder')"
            :invalid="Boolean(errorMessage('genres'))"
            :disabled="catalogueDisabled"
            fluid
            @hide="touch('genres')"
          />
          <small v-if="errorMessage('genres')" class="text-red-600">{{
            errorMessage('genres')
          }}</small>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="series-tags" class="text-sm font-medium">{{ t('series.form.tags') }}</label>
          <AutoComplete
            :model-value="values.tags"
            input-id="series-tags"
            multiple
            :typeahead="false"
            :suggestions="tagSuggestions"
            :placeholder="values.tags.length === 0 ? t('series.form.tagsPlaceholder') : undefined"
            :invalid="Boolean(errorMessage('tags'))"
            :disabled="catalogueDisabled"
            fluid
            @update:model-value="onTagsUpdate"
          />
          <small v-if="errorMessage('tags')" class="text-red-600">{{ errorMessage('tags') }}</small>
          <small v-else class="text-xs text-muted-color">{{ t('series.form.tagsHint') }}</small>
        </div>
      </div>
    </fieldset>

    <!-- Classification -->
    <fieldset
      class="grid gap-5 rounded-lg border border-surface-200 bg-surface-0 p-5 md:grid-cols-2"
    >
      <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
        {{ t('series.form.sections.classification') }}
      </legend>

      <div class="flex flex-col gap-1.5">
        <label for="series-language" class="text-sm font-medium">{{
          t('series.form.language')
        }}</label>
        <Select
          v-model="values.language"
          input-id="series-language"
          :options="languageOptions"
          option-label="label"
          option-value="value"
          :invalid="Boolean(errorMessage('language'))"
          :disabled="catalogueDisabled"
          fluid
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="series-age-rating" class="text-sm font-medium">
          {{ t('series.form.ageRating') }}
        </label>
        <Select
          v-model="values.ageRating"
          input-id="series-age-rating"
          :options="ageRatingOptions"
          option-label="label"
          option-value="value"
          :invalid="Boolean(errorMessage('ageRating'))"
          :disabled="catalogueDisabled"
          fluid
        />
      </div>
    </fieldset>

    <!-- Monetisation -->
    <fieldset class="grid gap-5 rounded-lg border border-surface-200 bg-surface-0 p-5">
      <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
        {{ t('series.form.sections.monetization') }}
      </legend>
      <Message v-if="!monetizationEditable" severity="secondary" :closable="false" size="small">
        <i class="pi pi-lock mr-2" aria-hidden="true" />{{ t('series.form.monetizationLocked') }}
      </Message>
      <div class="grid gap-5 md:grid-cols-2">
        <div class="flex flex-col gap-1.5">
          <label for="series-free-episodes" class="text-sm font-medium">
            {{ t('series.form.freeEpisodeCount') }}
          </label>
          <InputNumber
            v-model="values.freeEpisodeCount"
            input-id="series-free-episodes"
            :min="0"
            :max="SERIES_LIMITS.freeEpisodesMax"
            :use-grouping="false"
            show-buttons
            :invalid="Boolean(errorMessage('freeEpisodeCount'))"
            :disabled="monetizationDisabled"
            fluid
            @blur="touch('freeEpisodeCount')"
          />
          <small v-if="errorMessage('freeEpisodeCount')" class="text-red-600">
            {{ errorMessage('freeEpisodeCount') }}
          </small>
          <small v-else class="text-xs text-muted-color">{{
            t('series.form.freeEpisodeHint')
          }}</small>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="series-coin-cost" class="text-sm font-medium">
            {{ t('series.form.coinCostPerEpisode') }}
          </label>
          <InputNumber
            v-model="values.coinCostPerEpisode"
            input-id="series-coin-cost"
            :min="0"
            :max="SERIES_LIMITS.coinCostMax"
            :use-grouping="false"
            show-buttons
            :suffix="` ${t('series.form.coins')}`"
            :invalid="Boolean(errorMessage('coinCostPerEpisode'))"
            :disabled="monetizationDisabled"
            fluid
            @blur="touch('coinCostPerEpisode')"
          />
          <small v-if="errorMessage('coinCostPerEpisode')" class="text-red-600">
            {{ errorMessage('coinCostPerEpisode') }}
          </small>
        </div>
      </div>
    </fieldset>

    <!-- Distribution -->
    <fieldset class="grid gap-5 rounded-lg border border-surface-200 bg-surface-0 p-5">
      <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
        {{ t('series.form.sections.distribution') }}
      </legend>
      <div class="flex flex-col gap-1.5">
        <label for="series-territories" class="text-sm font-medium">
          {{ t('series.form.territories') }}
        </label>
        <CatalogueTerritoriesInput
          v-model="values.territories"
          input-id="series-territories"
          :invalid="Boolean(errorMessage('territories'))"
          :disabled="catalogueDisabled"
        />
        <small v-if="errorMessage('territories')" class="text-red-600">
          {{ errorMessage('territories') }}
        </small>
        <small v-else class="text-xs text-muted-color">{{
          t('series.form.territoriesHint')
        }}</small>
      </div>
    </fieldset>

    <!-- Scheduling (B-04) — only on an existing series: the contract accepts publishedAt on PATCH -->
    <fieldset
      v-if="series"
      class="grid gap-5 rounded-lg border border-surface-200 bg-surface-0 p-5"
    >
      <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
        {{ t('series.form.sections.scheduling') }}
      </legend>
      <div class="flex flex-col gap-1.5">
        <label for="series-published-at" class="text-sm font-medium">
          {{ t('series.form.publishedAt') }}
        </label>
        <div class="grid gap-3 sm:grid-cols-[minmax(0,20rem)_auto] sm:items-center">
          <DatePicker
            v-model="publishedAtPicker"
            input-id="series-published-at"
            show-time
            hour-format="24"
            show-icon
            show-button-bar
            date-format="dd/mm/yy"
            :step-minute="5"
            :invalid="Boolean(errorMessage('publishedAt'))"
            :disabled="catalogueDisabled"
            fluid
          />
          <Tag
            v-if="publicationInfo"
            :value="publicationInfo"
            :severity="publicationState(values.publishedAt) === 'scheduled' ? 'info' : 'success'"
            :icon="
              publicationState(values.publishedAt) === 'scheduled'
                ? 'pi pi-calendar-clock'
                : 'pi pi-check'
            "
            class="justify-self-start"
          />
        </div>
        <small v-if="errorMessage('publishedAt')" class="text-red-600">
          {{ errorMessage('publishedAt') }}
        </small>
        <small v-else class="text-xs text-muted-color">{{
          t('series.form.publishedAtHint')
        }}</small>
      </div>
    </fieldset>

    <!-- Posters -->
    <fieldset
      class="grid gap-6 rounded-lg border border-surface-200 bg-surface-0 p-5 lg:grid-cols-2"
    >
      <legend class="px-1 text-sm font-semibold uppercase tracking-wide text-muted-color">
        {{ t('series.form.sections.posters') }}
      </legend>
      <CataloguePosterUpload
        v-model="values.posterVerticalUrl"
        orientation="vertical"
        input-id="series-poster-vertical"
        :label="t('series.form.posterVertical')"
        :disabled="catalogueDisabled"
      />
      <CataloguePosterUpload
        v-model="values.posterHorizontalUrl"
        orientation="horizontal"
        input-id="series-poster-horizontal"
        :label="t('series.form.posterHorizontal')"
        :disabled="catalogueDisabled"
      />
    </fieldset>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <slot name="actions" />
      <Button
        type="submit"
        :label="series ? t('common.save') : t('series.actions.create')"
        icon="pi pi-check"
        :loading="saving"
        :disabled="readOnly || isArchived || (Boolean(series) && !isDirty)"
      />
    </div>
  </form>
</template>
