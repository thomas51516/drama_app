<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { HOME_TITLE_LANGUAGES } from '../../types/api'
import { useFeaturedApi } from '../../composables/useFeaturedApi'
import { useMediaUrl } from '../../composables/useMediaUrl'
import { countryOptions } from '../../utils/countries'
import { normalizeHomePreview, type PreviewModel } from '../../utils/featured'

/**
 * "Aperçu" tab (B-05): calls `GET /admin/home/preview?country&lang` and renders banners and
 * rows the way the Android home (M-01) does, inside a phone-sized dark frame.
 */
const { t, locale } = useI18n()
const api = useFeaturedApi()
const media = useMediaUrl()

const country = ref('TG')
const lang = ref<string>('fr')
const countries = computed(() => countryOptions(locale.value))
const langOptions = HOME_TITLE_LANGUAGES.map((value) => ({
  value,
  label: value.toUpperCase(),
}))

const { data, status, error, refresh } = useAsyncData(
  'admin-home-preview',
  () => api.preview({ country: country.value, lang: lang.value }),
  { watch: [country, lang] },
)
const model = computed<PreviewModel>(() => normalizeHomePreview(data.value))
const loading = computed(() => status.value === 'pending')

const broken = ref(new Set<string>())
watch(data, () => broken.value.clear())
function image(url: string | null, key: string): string | null {
  if (!url || broken.value.has(key)) return null
  return media.resolve(url)
}
function markBroken(key: string): void {
  broken.value = new Set([...broken.value, key])
}
</script>

<template>
  <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
    <div class="flex flex-col gap-4 lg:w-72 lg:shrink-0">
      <div class="flex flex-col gap-1">
        <label for="preview-country" class="text-sm font-medium">{{
          t('featured.preview.country')
        }}</label>
        <Select
          v-model="country"
          input-id="preview-country"
          :options="countries"
          option-label="label"
          option-value="code"
          filter
          fluid
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">{{ t('featured.preview.language') }}</span>
        <SelectButton
          v-model="lang"
          :options="langOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :aria-label="t('featured.preview.language')"
        />
      </div>
      <Button
        :label="t('featured.preview.refresh')"
        icon="pi pi-refresh"
        size="small"
        outlined
        :loading="loading"
        @click="refresh()"
      />
      <p class="text-xs text-muted-color">{{ t('featured.preview.hint') }}</p>
      <Message v-if="error" severity="error" :closable="false">{{
        t('featured.preview.error')
      }}</Message>
    </div>

    <div
      class="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-8 border-surface-900 bg-black text-white shadow-xl"
      data-testid="home-preview"
    >
      <div class="flex items-center justify-between px-4 py-3 text-xs text-white/70">
        <span class="font-semibold tracking-wide text-white">DRAMA</span>
        <span>{{ country }} · {{ lang.toUpperCase() }}</span>
      </div>

      <div class="max-h-[70vh] overflow-y-auto pb-6">
        <section
          v-if="model.banners.length > 0"
          class="px-3"
          :aria-label="t('featured.tabs.banners')"
        >
          <div class="flex snap-x gap-3 overflow-x-auto pb-2">
            <article
              v-for="banner in model.banners"
              :key="banner.id"
              class="relative aspect-video w-[85%] shrink-0 snap-start overflow-hidden rounded-xl bg-surface-800"
              data-testid="preview-banner"
            >
              <img
                v-if="image(banner.imageUrl, `b-${banner.id}`)"
                :src="image(banner.imageUrl, `b-${banner.id}`) ?? undefined"
                alt=""
                class="h-full w-full object-cover"
                @error="markBroken(`b-${banner.id}`)"
              />
              <div
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3"
              >
                <p class="text-sm font-semibold leading-tight">{{ banner.title }}</p>
                <p v-if="banner.subtitle" class="text-xs text-white/80">{{ banner.subtitle }}</p>
              </div>
            </article>
          </div>
        </section>
        <p v-else-if="!loading" class="px-4 py-6 text-center text-xs text-white/60">
          {{ t('featured.preview.noBanners') }}
        </p>

        <section
          v-for="row in model.rows"
          :key="row.key"
          class="mt-4 px-3"
          data-testid="preview-row"
        >
          <h3 class="mb-2 text-sm font-semibold">{{ row.title }}</h3>
          <div v-if="row.items.length > 0" class="flex gap-2 overflow-x-auto pb-2">
            <article v-for="series in row.items" :key="series.id" class="w-24 shrink-0">
              <div class="relative aspect-[2/3] overflow-hidden rounded-lg bg-surface-800">
                <img
                  v-if="image(series.posterVerticalUrl, `s-${row.key}-${series.id}`)"
                  :src="image(series.posterVerticalUrl, `s-${row.key}-${series.id}`) ?? undefined"
                  alt=""
                  class="h-full w-full object-cover"
                  loading="lazy"
                  @error="markBroken(`s-${row.key}-${series.id}`)"
                />
                <span
                  v-if="series.freeEpisodeCount > 0"
                  class="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] font-semibold text-primary-contrast"
                >
                  {{ t('featured.preview.free', { count: series.freeEpisodeCount }) }}
                </span>
              </div>
              <p class="mt-1 line-clamp-2 text-xs leading-tight">{{ series.title }}</p>
              <p class="text-[10px] text-white/60">
                {{ t('episodes.count', { count: series.episodeCount }, series.episodeCount) }}
              </p>
            </article>
          </div>
          <p v-else class="text-xs text-white/50">{{ t('featured.preview.emptyRow') }}</p>
        </section>

        <p
          v-if="!loading && model.rows.length === 0"
          class="px-4 py-6 text-center text-xs text-white/60"
        >
          {{ t('featured.preview.noRows') }}
        </p>
        <div v-if="loading" class="px-4 py-6 text-center text-xs text-white/60">
          <i class="pi pi-spin pi-spinner mr-2" aria-hidden="true" />{{ t('common.loading') }}
        </div>
      </div>
    </div>
  </div>
</template>
