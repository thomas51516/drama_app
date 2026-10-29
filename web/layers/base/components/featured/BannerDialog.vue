<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries, HomeBanner } from '../../types/api'
import { useFeaturedApi } from '../../composables/useFeaturedApi'
import { useNotify } from '../../composables/useNotify'
import {
  BANNER_SUBTITLE_MAX,
  BANNER_TITLE_MAX,
  bannerFormToInput,
  bannerToForm,
  emptyBannerForm,
  validateBannerForm,
  type BannerFormErrors,
} from '../../utils/featured'

/** Create / edit dialog of a home banner (B-05). Emits `saved` with the API result. */
const props = defineProps<{
  visible: boolean
  banner: HomeBanner | null
  seriesById: Record<string, AdminSeries>
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [banner: HomeBanner]
  resolved: [series: AdminSeries]
}>()

const { t } = useI18n()
const api = useFeaturedApi()
const notify = useNotify()

const form = ref(emptyBannerForm())
const errors = ref<BannerFormErrors>({})
const submitted = ref(false)
const saving = ref(false)

const isEdit = computed(() => props.banner !== null)
const title = computed(() =>
  isEdit.value ? t('featured.banners.edit') : t('featured.banners.create'),
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = props.banner ? bannerToForm(props.banner) : emptyBannerForm()
    errors.value = {}
    submitted.value = false
  },
)

watch(
  form,
  (values) => {
    if (submitted.value) errors.value = validateBannerForm(values)
  },
  { deep: true },
)

function onSeriesPicked(series: AdminSeries): void {
  emit('resolved', series)
  if (!form.value.title.trim()) form.value.title = series.title
  if (!form.value.imageUrl && series.posterHorizontalUrl) {
    form.value.imageUrl = series.posterHorizontalUrl
  }
}

function errorMessage(key: keyof BannerFormErrors): string | undefined {
  const code = errors.value[key]
  if (!code) return undefined
  const params =
    key === 'title'
      ? { max: BANNER_TITLE_MAX }
      : key === 'subtitle'
        ? { max: BANNER_SUBTITLE_MAX }
        : { value: form.value.countries.find((c) => !/^[A-Z]{2}$/.test(c)) ?? '' }
  return t(code, params)
}

async function save(): Promise<void> {
  submitted.value = true
  errors.value = validateBannerForm(form.value)
  if (Object.keys(errors.value).length > 0) {
    notify.warn(t('validation.fixErrors'))
    return
  }
  saving.value = true
  try {
    const input = bannerFormToInput(form.value)
    const saved = props.banner
      ? await api.updateBanner(props.banner.id, input)
      : await api.createBanner(input)
    notify.success(
      t(isEdit.value ? 'featured.toasts.bannerSaved' : 'featured.toasts.bannerCreated'),
    )
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
        <label for="banner-series" class="text-sm font-medium">{{
          t('featured.banners.form.series')
        }}</label>
        <FeaturedSeriesPicker
          v-model="form.seriesId"
          input-id="banner-series"
          :series-by-id="seriesById"
          :disabled="saving"
          :invalid="Boolean(errors.seriesId)"
          @select="onSeriesPicked"
        />
        <small v-if="errors.seriesId" class="text-red-600">{{ errorMessage('seriesId') }}</small>
      </div>

      <CataloguePosterUpload
        v-model="form.imageUrl"
        orientation="horizontal"
        :label="t('featured.banners.form.image')"
        :disabled="saving"
        input-id="banner-image"
      />
      <small v-if="errors.imageUrl" class="-mt-4 text-red-600">{{
        errorMessage('imageUrl')
      }}</small>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="banner-title" class="text-sm font-medium">{{
            t('featured.banners.form.title')
          }}</label>
          <InputText
            id="banner-title"
            v-model="form.title"
            :maxlength="BANNER_TITLE_MAX"
            :invalid="Boolean(errors.title)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.title" class="text-red-600">{{ errorMessage('title') }}</small>
        </div>
        <div class="flex flex-col gap-1">
          <label for="banner-subtitle" class="text-sm font-medium">{{
            t('featured.banners.form.subtitle')
          }}</label>
          <InputText
            id="banner-subtitle"
            v-model="form.subtitle"
            :maxlength="BANNER_SUBTITLE_MAX"
            :invalid="Boolean(errors.subtitle)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.subtitle" class="text-red-600">{{ errorMessage('subtitle') }}</small>
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label for="banner-countries" class="text-sm font-medium">{{
          t('featured.form.countries')
        }}</label>
        <CatalogueTerritoriesInput
          v-model="form.countries"
          input-id="banner-countries"
          :disabled="saving"
          :invalid="Boolean(errors.countries)"
        />
        <small class="text-xs text-muted-color">{{ t('featured.form.countriesHint') }}</small>
        <small v-if="errors.countries" class="text-red-600">{{ errorMessage('countries') }}</small>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="banner-starts" class="text-sm font-medium">{{
            t('featured.banners.form.startsAt')
          }}</label>
          <DatePicker
            v-model="form.startsAt"
            input-id="banner-starts"
            show-time
            hour-format="24"
            show-icon
            show-button-bar
            date-format="dd/mm/yy"
            :disabled="saving"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="banner-ends" class="text-sm font-medium">{{
            t('featured.banners.form.endsAt')
          }}</label>
          <DatePicker
            v-model="form.endsAt"
            input-id="banner-ends"
            show-time
            hour-format="24"
            show-icon
            show-button-bar
            date-format="dd/mm/yy"
            :min-date="form.startsAt ?? undefined"
            :invalid="Boolean(errors.endsAt)"
            :disabled="saving"
            fluid
          />
          <small v-if="errors.endsAt" class="text-red-600">{{ t('validation.dateRange') }}</small>
        </div>
      </div>
      <p class="-mt-3 text-xs text-muted-color">{{ t('featured.banners.form.scheduleHint') }}</p>

      <div class="flex items-center gap-3">
        <ToggleSwitch v-model="form.isActive" input-id="banner-active" :disabled="saving" />
        <label for="banner-active" class="text-sm">{{ t('featured.form.active') }}</label>
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
