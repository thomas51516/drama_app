<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { StatsOverview, StatsPeriod } from '#base/types/api'
import { STATS_PERIODS } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { canManageMonetization } from '#base/utils/monetization'
import { createPoller } from '#base/utils/polling'
import {
  deriveConversionView,
  deriveTiles,
  formatPercent,
  isEmptyOverview,
  isStatsPeriod,
  rankTopSeries,
  STATS_REFRESH_INTERVAL_MS,
  type TopSeriesRow,
} from '#base/utils/stats'

/**
 * B-11 — dashboard: KPI tiles, top series (chart + table), revenue by source, paywall conversion,
 * retention per episode, 7/30-day period, auto-refresh every 5 minutes (the backend caches the
 * overview for 5 minutes as well).
 */
const { t, d, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const api = useStatsApi()
const catalogueApi = useCatalogueApi()
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

// --- revenue by source and paywall conversion (B-11, sprint 9) ---------------------------
const revenueRows = computed(() => overview.value?.revenueBySource ?? [])
const conversion = computed(() =>
  overview.value
    ? deriveConversionView(overview.value)
    : { conversionRate: null, paywallViewers: 0, convertedViewers: 0, windowHours: 24 },
)

// --- retention per episode (B-11, sprint 9) ----------------------------------------------
const { data: seriesOptionsData } = await useAsyncData(
  'admin-stats-retention-series-options',
  () => catalogueApi.listSeries({ pageSize: 100 }),
  { default: () => null },
)
const seriesOptions = computed(() => [
  { value: null, label: t('dashboard.retention.wholeCatalogue') },
  ...(seriesOptionsData.value?.items ?? [])
    .map((series) => ({ value: series.id, label: series.title }))
    .sort((a, b) => a.label.localeCompare(b.label)),
])
const retentionSeriesId = ref<string | null>(
  typeof route.query.seriesId === 'string' ? route.query.seriesId : null,
)
watch(retentionSeriesId, (value) => {
  void router.replace({ query: { ...route.query, seriesId: value ?? undefined } })
})
const {
  data: retention,
  status: retentionStatus,
  error: retentionError,
  refresh: refreshRetention,
} = await useAsyncData(
  () => `admin-stats-retention-${retentionSeriesId.value ?? 'all'}`,
  () => api.retention(retentionSeriesId.value ?? undefined),
  { watch: [retentionSeriesId], default: () => null },
)
const retentionLoading = computed(() => retentionStatus.value === 'pending')
const retentionPoints = computed(() => retention.value?.points ?? [])

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

/** B-11: the top-up reconciliation lives under the dashboard menu (MONETIZATION, ADMIN). */
const auth = useAuthStore()
const canReconcile = computed(() => canManageMonetization(auth.user?.role))
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('dashboard.title')"
      :subtitle="t('dashboard.subtitle')"
      :crumbs="[{ label: t('dashboard.title') }]"
    >
      <template #actions>
        <NuxtLink v-if="canReconcile" to="/topup-reconciliation">
          <Button
            icon="pi pi-sync"
            :label="t('nav.topupReconciliation')"
            severity="secondary"
            outlined
            data-testid="open-reconciliation"
          />
        </NuxtLink>
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

      <section aria-labelledby="dashboard-revenue">
        <div class="mb-3">
          <h2 id="dashboard-revenue" class="text-lg font-semibold">
            {{ t('dashboard.sections.revenue') }}
          </h2>
          <p class="text-sm text-muted-color">{{ t('dashboard.revenue.subtitle') }}</p>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <DashboardRevenueBreakdown :rows="revenueRows" :loading="loading" />
          </div>
          <DashboardConversionTile
            :conversion-rate="conversion.conversionRate"
            :paywall-viewers="conversion.paywallViewers"
            :converted-viewers="conversion.convertedViewers"
            :window-hours="conversion.windowHours"
            :loading="loading"
          />
        </div>
      </section>

      <section aria-labelledby="dashboard-retention">
        <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dashboard-retention" class="text-lg font-semibold">
              {{ t('dashboard.sections.retention') }}
            </h2>
            <p class="text-sm text-muted-color">{{ t('dashboard.retention.subtitle') }}</p>
          </div>
          <Select
            v-model="retentionSeriesId"
            :options="seriesOptions"
            option-label="label"
            option-value="value"
            :aria-label="t('dashboard.retention.seriesLabel')"
            class="w-full sm:w-72"
          />
        </div>

        <Message v-if="retentionError" severity="error" :closable="false">
          <div class="flex flex-wrap items-center gap-3">
            <span>{{ t('dashboard.retention.loadError') }}</span>
            <Button
              :label="t('common.retry')"
              size="small"
              severity="danger"
              outlined
              @click="refreshRetention()"
            />
          </div>
        </Message>
        <div
          v-else-if="retentionLoading && retentionPoints.length === 0"
          class="grid gap-4 lg:grid-cols-2"
        >
          <Skeleton height="16rem" />
          <Skeleton height="16rem" />
        </div>
        <p
          v-else-if="retentionPoints.length === 0"
          class="rounded-lg border border-dashed border-surface-300 bg-surface-0 py-10 text-center text-sm text-muted-color"
        >
          {{ t('dashboard.retention.empty') }}
        </p>
        <div v-else class="grid gap-4 lg:grid-cols-2">
          <ClientOnly>
            <DashboardRetentionChart :points="retentionPoints" />
          </ClientOnly>
          <DataTable
            :value="retentionPoints"
            data-key="episodeNumber"
            size="small"
            striped-rows
            class="rounded-lg border border-surface-200 bg-surface-0"
          >
            <Column :header="t('dashboard.retention.columns.episode')" class="w-24 text-right">
              <template #body="{ data: row }: { data: { episodeNumber: number } }">
                <span class="tabular-nums">{{ row.episodeNumber }}</span>
              </template>
            </Column>
            <Column :header="t('dashboard.retention.columns.viewers')" class="text-right">
              <template #body="{ data: row }: { data: { viewers: number } }">
                <span class="tabular-nums">{{ row.viewers.toLocaleString(locale) }}</span>
              </template>
            </Column>
            <Column :header="t('dashboard.retention.columns.retention')" class="w-28 text-right">
              <template #body="{ data: row }: { data: { retentionPercent: number } }">
                <span class="tabular-nums">{{
                  formatPercent(row.retentionPercent / 100, locale)
                }}</span>
              </template>
            </Column>
          </DataTable>
        </div>
        <p class="mt-2 text-xs text-muted-color">{{ t('dashboard.retention.hint') }}</p>
      </section>
    </div>
  </div>
</template>
