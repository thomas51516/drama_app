<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { StatsOverview, StatsPeriod } from '#base/types/api'
import { STATS_PERIODS } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { createPoller } from '#base/utils/polling'
import {
  deriveTiles,
  formatPercent,
  isEmptyOverview,
  isStatsPeriod,
  rankTopSeries,
  STATS_REFRESH_INTERVAL_MS,
  type TopSeriesRow,
} from '#base/utils/stats'

/**
 * B-11 v0 — dashboard: KPI tiles, top series (chart + table), 7/30-day period, auto-refresh
 * every 5 minutes (the backend caches the overview for 5 minutes as well).
 */
const { t, d, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const api = useStatsApi()
const notify = useNotify()

const period = ref<StatsPeriod>(
  isStatsPeriod(route.query.days) ? (Number(route.query.days) as StatsPeriod) : 7,
)
watch(period, (value) => {
  void router.replace({ query: { ...route.query, days: value === 7 ? undefined : String(value) } })
})

const {
  data: overview,
  status,
  error,
  refresh,
} = await useAsyncData<StatsOverview | null>(
  () => `admin-stats-overview-${period.value}`,
  () => api.overview(period.value),
  { watch: [period], default: () => null },
)

const loading = computed(() => status.value === 'pending')
const forbidden = computed(() => ApiError.is(error.value) && error.value.status === 403)
const empty = computed(() => !loading.value && !error.value && isEmptyOverview(overview.value))

const tiles = computed(() =>
  overview.value
    ? deriveTiles(overview.value)
    : deriveTiles({
        activeUsers: { d1: 0, d7: 0, d30: 0 },
        newUsers: 0,
        registeredUsers: 0,
        guestUsers: 0,
        episodesStarted: 0,
        episodesCompleted: 0,
        topSeries: [],
        generatedAt: '',
      }).map((tile) => ({ ...tile, value: null, hint: undefined })),
)
const userTiles = computed(() => tiles.value.slice(0, 6))
const viewingTiles = computed(() => tiles.value.slice(6))
const topSeries = computed<TopSeriesRow[]>(() => rankTopSeries(overview.value?.topSeries ?? []))

// --- auto refresh -------------------------------------------------------------------------
const refreshing = ref(false)
async function reload(): Promise<void> {
  refreshing.value = true
  try {
    await refresh()
  } catch (err) {
    notify.apiError(err, t('dashboard.loadError'))
  } finally {
    refreshing.value = false
  }
}
const poller = createPoller({
  intervalMs: STATS_REFRESH_INTERVAL_MS,
  task: async () => {
    await refresh()
    return true
  },
})
poller.start()
onBeforeUnmount(() => poller.stop())

const periodOptions = computed(() =>
  STATS_PERIODS.map((value) => ({ value, label: t(`dashboard.period.${value}`) })),
)
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('dashboard.title')"
      :subtitle="t('dashboard.subtitle')"
      :crumbs="[{ label: t('dashboard.title') }]"
    >
      <template #actions>
        <SelectButton
          v-model="period"
          :options="periodOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :aria-label="t('dashboard.period.label')"
        />
        <Button
          icon="pi pi-refresh"
          :label="t('dashboard.refresh')"
          severity="secondary"
          outlined
          :loading="refreshing || loading"
          @click="reload"
        />
      </template>
    </LayoutPageHeader>

    <LayoutForbidden v-if="forbidden" />

    <div v-else class="flex flex-col gap-8">
      <Message v-if="error" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('dashboard.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="reload"
          />
        </div>
      </Message>

      <Message v-else-if="empty" severity="info" :closable="false">
        <strong>{{ t('dashboard.empty.title') }}</strong> — {{ t('dashboard.empty.hint') }}
      </Message>

      <p class="-mt-4 text-xs text-muted-color">
        <template v-if="overview?.generatedAt">
          {{ t('dashboard.generatedAt', { date: d(new Date(overview.generatedAt), 'long') }) }} ·
        </template>
        {{ t('dashboard.autoRefresh') }}
      </p>

      <section aria-labelledby="dashboard-users">
        <h2 id="dashboard-users" class="mb-3 text-lg font-semibold">
          {{ t('dashboard.sections.users') }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <DashboardStatTile
            v-for="tile in userTiles"
            :key="tile.key"
            :tile="tile"
            :loading="loading"
          />
        </div>
      </section>

      <section aria-labelledby="dashboard-viewing">
        <h2 id="dashboard-viewing" class="mb-3 text-lg font-semibold">
          {{ t('dashboard.sections.viewing') }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <DashboardStatTile
            v-for="tile in viewingTiles"
            :key="tile.key"
            :tile="tile"
            :loading="loading"
          />
        </div>
        <p class="mt-2 text-xs text-muted-color">{{ t('dashboard.hints.periodNote') }}</p>
      </section>

      <section aria-labelledby="dashboard-top">
        <div class="mb-3">
          <h2 id="dashboard-top" class="text-lg font-semibold">
            {{ t('dashboard.sections.topSeries') }}
          </h2>
          <p class="text-sm text-muted-color">{{ t('dashboard.topSeries.subtitle') }}</p>
        </div>

        <div v-if="loading && topSeries.length === 0" class="grid gap-4 lg:grid-cols-2">
          <Skeleton height="14rem" />
          <Skeleton height="14rem" />
        </div>
        <p
          v-else-if="topSeries.length === 0"
          class="rounded-lg border border-dashed border-surface-300 bg-surface-0 py-10 text-center text-sm text-muted-color"
        >
          {{ t('dashboard.topSeries.empty') }}
        </p>
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <ClientOnly>
            <DashboardTopSeriesChart :rows="topSeries" />
          </ClientOnly>
          <DataTable
            :value="topSeries"
            data-key="seriesId"
            size="small"
            striped-rows
            class="rounded-lg border border-surface-200 bg-surface-0"
          >
            <Column :header="t('dashboard.topSeries.columns.rank')" class="w-10 text-right">
              <template #body="{ data: row }: { data: TopSeriesRow }">
                <span class="tabular-nums text-muted-color">{{ row.rank }}</span>
              </template>
            </Column>
            <Column :header="t('dashboard.topSeries.columns.title')">
              <template #body="{ data: row }: { data: TopSeriesRow }">
                <NuxtLink
                  :to="`/series/${row.seriesId}`"
                  class="hover:text-primary hover:underline"
                >
                  {{ row.title }}
                </NuxtLink>
              </template>
            </Column>
            <Column :header="t('dashboard.topSeries.columns.viewers')" class="w-28 text-right">
              <template #body="{ data: row }: { data: TopSeriesRow }">
                <span class="tabular-nums">{{ row.viewers.toLocaleString(locale) }}</span>
              </template>
            </Column>
            <Column :header="t('dashboard.topSeries.columns.completions')" class="w-32 text-right">
              <template #body="{ data: row }: { data: TopSeriesRow }">
                <span class="tabular-nums">{{ row.completions.toLocaleString(locale) }}</span>
              </template>
            </Column>
            <Column :header="t('dashboard.topSeries.columns.rate')" class="w-24 text-right">
              <template #body="{ data: row }: { data: TopSeriesRow }">
                <span class="tabular-nums">{{ formatPercent(row.completionRate, locale) }}</span>
              </template>
            </Column>
          </DataTable>
        </div>
      </section>
    </div>
  </div>
</template>
