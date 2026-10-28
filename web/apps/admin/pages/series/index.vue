<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries, SeriesStatus } from '#base/types/api'
import { SERIES_STATUSES } from '#base/types/api'
import { canEditCatalogue } from '#base/utils/series-form'

const { t, d, te } = useI18n()
const api = useCatalogueApi()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 20

// Filters live in the URL so a list state survives a refresh and can be shared.
const page = ref(Math.max(1, Number(route.query.page ?? 1) || 1))
const statusFilter = ref<SeriesStatus | null>(
  SERIES_STATUSES.includes(route.query.status as SeriesStatus)
    ? (route.query.status as SeriesStatus)
    : null,
)
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const debouncedSearch = ref(search.value)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(search, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = value.trim()
    page.value = 1
  }, 300)
})
watch(statusFilter, () => {
  page.value = 1
})

watch([page, statusFilter, debouncedSearch], ([nextPage, nextStatus, nextQuery]) => {
  void router.replace({
    query: {
      ...(nextPage > 1 ? { page: String(nextPage) } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextQuery ? { q: nextQuery } : {}),
    },
  })
})

const { data, status, error, refresh } = await useAsyncData(
  'admin-series-list',
  () =>
    api.listSeries({
      page: page.value,
      pageSize: PAGE_SIZE,
      status: statusFilter.value ?? undefined,
      q: debouncedSearch.value || undefined,
    }),
  { watch: [page, statusFilter, debouncedSearch] },
)

const series = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const loading = computed(() => status.value === 'pending')
const canCreate = computed(() => canEditCatalogue(auth.user?.role))

const statusOptions = SERIES_STATUSES.map((value) => ({
  value,
  label: t(`series.status.${value}`),
}))

function onPage(event: { page: number }): void {
  page.value = event.page + 1
}

function resetFilters(): void {
  search.value = ''
  debouncedSearch.value = ''
  statusFilter.value = null
  page.value = 1
}

function languageLabel(code: string): string {
  return te(`series.languages.${code}`) ? t(`series.languages.${code}`) : code.toUpperCase()
}
</script>

<template>
  <div>
    <LayoutPageHeader :title="t('series.title')" :subtitle="t('series.subtitle')">
      <template #actions>
        <NuxtLink v-if="canCreate" to="/series/new">
          <Button icon="pi pi-plus" :label="t('series.create')" />
        </NuxtLink>
      </template>
    </LayoutPageHeader>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <IconField class="w-full sm:w-72">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="search"
          type="search"
          :placeholder="t('series.filters.searchPlaceholder')"
          :aria-label="t('common.search')"
          fluid
        />
      </IconField>
      <Select
        v-model="statusFilter"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        show-clear
        :placeholder="t('series.filters.allStatuses')"
        :aria-label="t('series.columns.status')"
        class="w-full sm:w-52"
      />
      <Button
        v-if="search || statusFilter"
        :label="t('series.filters.reset')"
        icon="pi pi-filter-slash"
        text
        size="small"
        @click="resetFilters"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false" class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('series.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <DataTable
      :value="series"
      :loading="loading"
      data-key="id"
      lazy
      paginator
      :rows="PAGE_SIZE"
      :total-records="total"
      :first="(page - 1) * PAGE_SIZE"
      striped-rows
      :row-hover="true"
      class="rounded-lg border border-surface-200 bg-surface-0"
      @page="onPage"
    >
      <template #header>
        <div class="text-sm text-muted-color">
          {{ t('series.count', { count: total }, total) }}
        </div>
      </template>

      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-inbox text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('series.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">
            {{ search || statusFilter ? t('series.empty.filtered') : t('series.empty.hint') }}
          </p>
        </div>
      </template>

      <Column :header="t('series.columns.title')">
        <template #body="{ data: row }: { data: AdminSeries }">
          <div class="flex items-center gap-3">
            <div class="h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-200">
              <img
                v-if="row.posterVerticalUrl"
                :src="useMediaUrl().resolve(row.posterVerticalUrl) ?? undefined"
                :alt="''"
                class="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div class="min-w-0">
              <NuxtLink :to="`/series/${row.id}`" class="font-medium hover:underline">
                {{ row.title }}
              </NuxtLink>
              <div class="truncate text-xs text-muted-color">
                {{ row.genres.map((genre) => t(`series.genres.${genre}`)).join(' · ') }}
              </div>
            </div>
          </div>
        </template>
      </Column>

      <Column :header="t('series.columns.status')" class="w-36">
        <template #body="{ data: row }: { data: AdminSeries }">
          <CatalogueSeriesStatusTag :status="row.status" />
        </template>
      </Column>

      <Column :header="t('series.columns.language')" class="w-28">
        <template #body="{ data: row }: { data: AdminSeries }">
          {{ languageLabel(row.language) }}
        </template>
      </Column>

      <Column :header="t('series.columns.episodeCount')" class="w-28 text-right">
        <template #body="{ data: row }: { data: AdminSeries }">
          <NuxtLink :to="`/series/${row.id}/episodes`" class="tabular-nums hover:underline">
            {{ row.episodeCount }}
          </NuxtLink>
        </template>
      </Column>

      <Column :header="t('series.columns.updatedAt')" class="w-44">
        <template #body="{ data: row }: { data: AdminSeries }">
          <time :datetime="row.updatedAt">{{ d(new Date(row.updatedAt), 'long') }}</time>
        </template>
      </Column>

      <Column class="w-28">
        <template #body="{ data: row }: { data: AdminSeries }">
          <div class="flex justify-end gap-1">
            <NuxtLink :to="`/series/${row.id}`">
              <Button
                icon="pi pi-pencil"
                text
                size="small"
                :aria-label="t('series.edit')"
                :title="t('series.edit')"
              />
            </NuxtLink>
            <NuxtLink :to="`/series/${row.id}/episodes`">
              <Button
                icon="pi pi-video"
                text
                size="small"
                :aria-label="t('series.episodes')"
                :title="t('series.episodes')"
              />
            </NuxtLink>
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
