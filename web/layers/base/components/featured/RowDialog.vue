<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries, HomeRow } from '../../types/api'
import { HOME_ROW_TYPES, HOME_TITLE_LANGUAGES, SERIES_GENRES } from '../../types/api'
import { useFeaturedApi } from '../../composables/useFeaturedApi'
import { useNotify } from '../../composables/useNotify'
import {
  ROW_TITLE_MAX,
  emptyRowForm,
  rowFormToInput,
  rowNeedsGenre,
  rowNeedsSeries,
  rowToForm,
  suggestRowKey,
  validateRowForm,
  type RowFormErrors,
} from '../../utils/featured'

/** Create / edit dialog of a home row (B-05): type-dependent fields. */
const props = defineProps<{
  visible: boolean
  row: HomeRow | null
  seriesById: Record<string, AdminSeries>
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [row: HomeRow]
  resolved: [series: AdminSeries]
}>()

const { t } = useI18n()
const api = useFeaturedApi()
const notify = useNotify()

const form = ref(emptyRowForm())
const errors = ref<RowFormErrors>({})
const submitted = ref(false)
const saving = ref(false)

const isEdit = computed(() => props.row !== null)
const title = computed(() => (isEdit.value ? t('featured.rows.edit') : t('featured.rows.create')))
const typeOptions = HOME_ROW_TYPES.map((value) => ({
  value,
  label: t(`featured.rows.types.${value}`),
}))
const genreOptions = SERIES_GENRES.map((value) => ({ value, label: t(`series.genres.${value}`) }))
const needsGenre = computed(() => rowNeedsGenre(form.value.type))
const needsSeries = computed(() => rowNeedsSeries(form.value.type))

/** The key follows the type / genre / French title until the editor types one by hand. */
const keyTouched = ref(false)
const suggestedKey = computed(() => suggestRowKey(form.value))
watch(suggestedKey, (value) => {
  if (!keyTouched.value) form.value.key = value
})
function onKeyInput(): void {
  keyTouched.value = true
}
function resetKey(): void {
  keyTouched.value = false
  form.value.key = suggestedKey.value
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.row ? rowToForm(props.row) : emptyRowForm()
    keyTouched.value = Boolean(props.row)
    if (!props.row) form.value.key = suggestRowKey(form.value)
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateRowForm(values)
  },
  { deep: true },
)

function errorMessage(key: keyof RowFormErrors): string | undefined {
  const code = errors.value[key]
  return code ? t(code, { max: ROW_TITLE_MAX, value: '' }) : undefined
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateRowForm(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  saving.value = true
  try {
    const input = rowFormToInput(form.value)
    const saved = props.row ? await api.updateRow(props.row.id, input) : await api.createRow(input)
    notify.success(t(isEdit.value ? 'featured.toasts.rowSaved' : 'featured.toasts.rowCreated'))
    emit('saved', saved)
    emit('update:visible', false)
  } catch (err) {
    notify.apiError(err, t('featured.toasts.saveFailed'))
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
    :style="{ width: 'min(40rem, 95vw)' }"
    :closable="!saving"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <div class="flex flex-col gap-1">
        <label for="row-type" class="text-sm font-medium">{{ t('featured.rows.form.type') }}</label>
        <Select
          v-model="form.type"
          input-id="row-type"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          :disabled="saving"
          fluid
        />
        <small class="text-xs text-muted-color">{{
          t(`featured.rows.typeHints.${form.type}`)
        }}</small>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{{ t('featured.rows.form.titles') }}</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="lang in HOME_TITLE_LANGUAGES" :key="lang" class="flex flex-col gap-1">
            <label :for="`row-title-${lang}`" class="text-xs uppercase text-muted-color">
              {{ t(`series.languages.${lang}`) }}
              <span v-if="lang === 'fr'" aria-hidden="true">*</span>
            </label>
            <InputText
              :id="`row-title-${lang}`"
              v-model="form.titles[lang]"
              :maxlength="ROW_TITLE_MAX"
              :invalid="
                Boolean(errors.titles) &&
                (lang === 'fr' || form.titles[lang].length > ROW_TITLE_MAX)
              "
              :disabled="saving"
              fluid
            />
          </div>
        </div>
        <small v-if="errors.titles" class="text-red-600">{{ errorMessage('titles') }}</small>
        <small v-else class="text-xs text-muted-color">{{
          t('featured.rows.form.titlesHint')
        }}</small>
      </fieldset>

      <div class="flex flex-col gap-1">
        <label for="row-key" class="text-sm font-medium">{{ t('featured.rows.form.key') }}</label>
        <div class="flex items-center gap-2">
          <InputText
            id="row-key"
            v-model="form.key"
            maxlength="80"
            class="flex-1 font-mono"
            :invalid="Boolean(errors.key)"
            :disabled="saving"
            @input="onKeyInput"
          />
          <Button
            v-if="keyTouched && form.key !== suggestedKey"
            type="button"
            icon="pi pi-replay"
            severity="secondary"
            text
            :aria-label="t('featured.rows.form.keyReset')"
            :title="t('featured.rows.form.keyReset')"
            @click="resetKey"
          />
        </div>
        <small v-if="errors.key" class="text-red-600">{{ errorMessage('key') }}</small>
        <small v-else class="text-xs text-muted-color">{{ t('featured.rows.form.keyHint') }}</small>
      </div>

      <div v-if="needsGenre" class="flex flex-col gap-1">
        <label for="row-genre" class="text-sm font-medium">{{
          t('featured.rows.form.genre')
        }}</label>
        <Select
          v-model="form.genre"
          input-id="row-genre"
          :options="genreOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('featured.rows.form.genrePlaceholder')"
          :invalid="Boolean(errors.genre)"
          :disabled="saving"
          fluid
        />
        <small v-if="errors.genre" class="text-red-600">{{ errorMessage('genre') }}</small>
      </div>

      <div v-if="needsSeries" class="flex flex-col gap-1">
        <label for="row-series" class="text-sm font-medium">{{
          t('featured.rows.form.series')
        }}</label>
        <FeaturedSeriesListEditor
          v-model="form.seriesIds"
          input-id="row-series"
          :series-by-id="seriesById"
          :disabled="saving"
          :invalid="Boolean(errors.seriesIds)"
          @resolved="emit('resolved', $event)"
        />
        <small v-if="errors.seriesIds" class="text-red-600">{{ errorMessage('seriesIds') }}</small>
      </div>

      <div class="flex flex-col gap-1">
        <label for="row-countries" class="text-sm font-medium">{{
          t('featured.form.countries')
        }}</label>
        <CatalogueTerritoriesInput
          v-model="form.countries"
          input-id="row-countries"
          :disabled="saving"
          :invalid="Boolean(errors.countries)"
        />
        <small class="text-xs text-muted-color">{{ t('featured.form.countriesHint') }}</small>
        <small v-if="errors.countries" class="text-red-600">{{ errorMessage('countries') }}</small>
      </div>

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isActive" input-id="row-active" :disabled="saving" />
        <label for="row-active" class="text-sm">{{ t('featured.form.active') }}</label>
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
