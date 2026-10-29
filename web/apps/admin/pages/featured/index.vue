<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { canEditCatalogue } from '#base/utils/series-form'

/** B-05 — home curation: banners, rows and the preview of the public home per country/language. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const catalogue = useCatalogueApi()

const TABS = ['banners', 'rows', 'preview'] as const
type Tab = (typeof TABS)[number]
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'banners')
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'banners' ? undefined : value } })
})

const canEdit = computed(() => canEditCatalogue(auth.user?.role))

// Series titles/posters for the tables and pickers (the catalogue is small in the MVP).
const { data: seriesPage, error } = await useAsyncData('admin-featured-series', () =>
  catalogue.listSeries({ page: 1, pageSize: 100 }),
)
const extra = ref<Record<string, AdminSeries>>({})
const seriesById = computed<Record<string, AdminSeries>>(() => ({
  ...Object.fromEntries((seriesPage.value?.items ?? []).map((series) => [series.id, series])),
  ...extra.value,
}))
function remember(series: AdminSeries): void {
  extra.value = { ...extra.value, [series.id]: series }
}

const forbidden = computed(() => ApiError.is(error.value) && error.value.status === 403)
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('featured.title')"
      :subtitle="t('featured.subtitle')"
      :crumbs="[{ label: t('featured.title') }]"
    />

    <LayoutForbidden v-if="forbidden" />

    <Tabs v-else v-model:value="tab" lazy>
      <TabList>
        <Tab value="banners"
          ><i class="pi pi-image mr-2" aria-hidden="true" />{{ t('featured.tabs.banners') }}</Tab
        >
        <Tab value="rows"
          ><i class="pi pi-list mr-2" aria-hidden="true" />{{ t('featured.tabs.rows') }}</Tab
        >
        <Tab value="preview"
          ><i class="pi pi-mobile mr-2" aria-hidden="true" />{{ t('featured.tabs.preview') }}</Tab
        >
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="banners">
          <FeaturedBannersPanel
            :series-by-id="seriesById"
            :can-edit="canEdit"
            @resolved="remember"
          />
        </TabPanel>
        <TabPanel value="rows">
          <FeaturedRowsPanel :series-by-id="seriesById" :can-edit="canEdit" @resolved="remember" />
        </TabPanel>
        <TabPanel value="preview">
          <FeaturedHomePreview />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
