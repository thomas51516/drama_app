<script setup lang="ts">
import type { Paginated, SeriesStatus, SeriesSummary } from '#base/types/api'

const { t, d } = useI18n()
const api = useApi()

const { data, status, error, refresh } = await useAsyncData<Paginated<SeriesSummary>>(
  'admin-series',
  () => api.get<Paginated<SeriesSummary>>('/admin/series', { query: { page: 1, pageSize: 50 } }),
)

const series = computed(() => data.value?.items ?? [])
const loading = computed(() => status.value === 'pending')

const statusSeverity: Record<SeriesStatus, 'secondary' | 'success' | 'contrast'> = {
  draft: 'secondary',
  published: 'success',
  archived: 'contrast',
}
</script>

<template>
  <div>
    <LayoutPageHeader :title="t('series.title')" :subtitle="t('series.subtitle')">
      <template #actions>
        <Button icon="pi pi-plus" :label="t('series.create')" disabled title="S03-WEB-03" />
      </template>
    </LayoutPageHeader>

    <Message v-if="error" severity="error" :closable="false" class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('series.loadError') }}</span>
        <Button
          :label="t('series.retry')"
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
      striped-rows
      :row-hover="true"
      sort-field="updatedAt"
      :sort-order="-1"
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <template #header>
        <div class="text-sm text-muted-color">
          {{ t('series.count', { count: series.length }, series.length) }}
        </div>
      </template>

      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-inbox text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('series.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('series.empty.hint') }}</p>
        </div>
      </template>

      <Column field="title" :header="t('series.columns.title')" sortable>
        <template #body="{ data: row }: { data: SeriesSummary }">
          <span class="font-medium">{{ row.title }}</span>
        </template>
      </Column>

      <Column field="status" :header="t('series.columns.status')" sortable class="w-40">
        <template #body="{ data: row }: { data: SeriesSummary }">
          <Tag :value="t(`series.status.${row.status}`)" :severity="statusSeverity[row.status]" />
        </template>
      </Column>

      <Column
        field="episodesCount"
        :header="t('series.columns.episodesCount')"
        sortable
        class="w-32 text-right"
      />

      <Column field="updatedAt" :header="t('series.columns.updatedAt')" sortable class="w-48">
        <template #body="{ data: row }: { data: SeriesSummary }">
          <time :datetime="row.updatedAt">{{ d(new Date(row.updatedAt), 'long') }}</time>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
