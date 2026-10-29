<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ScheduleItem } from '#base/types/api'
import { SCHEDULE_TIME_ZONE } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import {
  formatMonth,
  formatWallDate,
  groupByDay,
  monthGrid,
  shiftMonth,
  todayWallDate,
  upcomingRange,
} from '#base/utils/schedule'

/**
 * B-04 — planning of upcoming publications: month calendar or agenda list of
 * `GET /admin/schedule?from&to`. Editing happens on the series form and the episodes page.
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const api = useScheduleApi()

const VIEWS = ['month', 'list'] as const
type View = (typeof VIEWS)[number]
const LIST_DAYS = 90

const today = todayWallDate()
const view = ref<View>(
  VIEWS.includes(route.query.view as View) ? (route.query.view as View) : 'month',
)
const year = ref(Number(route.query.year) || today.year)
const month = ref(
  Number(route.query.month) >= 1 && Number(route.query.month) <= 12
    ? Number(route.query.month)
    : today.month,
)

watch([view, year, month], ([nextView, nextYear, nextMonth]) => {
  void router.replace({
    query: {
      ...route.query,
      view: nextView === 'month' ? undefined : nextView,
      year: nextYear === today.year ? undefined : String(nextYear),
      month: nextMonth === today.month && nextYear === today.year ? undefined : String(nextMonth),
    },
  })
})

const range = computed(() =>
  view.value === 'month'
    ? (({ from, to }) => ({ from, to }))(monthGrid(year.value, month.value))
    : upcomingRange(new Date(), LIST_DAYS),
)

const {
  data: items,
  status,
  error,
  refresh,
} = await useAsyncData(
  () => `admin-schedule-${range.value.from}-${range.value.to}`,
  () => api.listSchedule(range.value),
  { watch: [range], default: () => [] as ScheduleItem[] },
)

const loading = computed(() => status.value === 'pending')
const forbidden = computed(() => ApiError.is(error.value) && error.value.status === 403)
const monthTitle = computed(() => formatMonth(year.value, month.value, locale.value))
const isCurrentMonth = computed(() => year.value === today.year && month.value === today.month)

function move(delta: number): void {
  const next = shiftMonth(year.value, month.value, delta)
  year.value = next.year
  month.value = next.month
}
function goToday(): void {
  year.value = today.year
  month.value = today.month
}

function openItem(item: ScheduleItem): void {
  void navigateTo(
    item.kind === 'SERIES' ? `/series/${item.seriesId}` : `/series/${item.seriesId}/episodes`,
  )
}

// Day dialog (« + n autres » in a calendar cell)
const dayKey = ref<string | null>(null)
const dayItems = computed(() => {
  if (!dayKey.value) return []
  return groupByDay(items.value ?? []).find((group) => group.key === dayKey.value)?.items ?? []
})
const dayTitle = computed(() => {
  if (!dayKey.value) return ''
  const [y, m, d] = dayKey.value.split('-').map(Number) as [number, number, number]
  return t('schedule.dayDialog', {
    date: formatWallDate({ year: y, month: m, day: d }, locale.value),
  })
})

const viewOptions = computed(() =>
  VIEWS.map((value) => ({ value, label: t(`schedule.views.${value}`) })),
)
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('schedule.title')"
      :subtitle="t('schedule.subtitle')"
      :crumbs="[{ label: t('schedule.title') }]"
    >
      <template #actions>
        <SelectButton
          v-model="view"
          :options="viewOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :aria-label="t('schedule.views.month') + ' / ' + t('schedule.views.list')"
        />
      </template>
    </LayoutPageHeader>

    <LayoutForbidden v-if="forbidden" />

    <template v-else>
      <Message v-if="error" severity="error" :closable="false" class="mb-4">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('schedule.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="refresh()"
          />
        </div>
      </Message>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div v-if="view === 'month'" class="flex items-center gap-1">
          <Button
            icon="pi pi-chevron-left"
            text
            rounded
            severity="secondary"
            :aria-label="t('schedule.previousMonth')"
            @click="move(-1)"
          />
          <h2 class="min-w-44 text-center text-lg font-semibold capitalize">{{ monthTitle }}</h2>
          <Button
            icon="pi pi-chevron-right"
            text
            rounded
            severity="secondary"
            :aria-label="t('schedule.nextMonth')"
            @click="move(1)"
          />
          <Button
            :label="t('schedule.today')"
            size="small"
            text
            :disabled="isCurrentMonth"
            @click="goToday"
          />
        </div>
        <h2 v-else class="text-lg font-semibold">
          {{ t('schedule.listRange', { days: LIST_DAYS }) }}
        </h2>

        <div class="flex items-center gap-3 text-sm text-muted-color">
          <span v-if="loading" class="flex items-center gap-2">
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />{{ t('common.loading') }}
          </span>
          <span v-else>{{ t('schedule.count', { count: items.length }, items.length) }}</span>
          <span class="hidden sm:inline" :title="SCHEDULE_TIME_ZONE">
            <i class="pi pi-globe mr-1" aria-hidden="true" />{{ SCHEDULE_TIME_ZONE }}
          </span>
        </div>
      </div>

      <template v-if="view === 'month'">
        <ScheduleMonthCalendar
          :year="year"
          :month="month"
          :items="items"
          :loading="loading"
          @open-item="openItem"
          @open-day="dayKey = $event"
        />
        <p v-if="!loading && items.length === 0" class="mt-3 text-center text-sm text-muted-color">
          {{ t('schedule.emptyMonth') }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-color">
          <span class="flex items-center gap-1">
            <span class="inline-block h-3 w-3 rounded bg-primary-100" aria-hidden="true" />
            {{ t('schedule.legend.series') }}
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block h-3 w-3 rounded bg-surface-200" aria-hidden="true" />
            {{ t('schedule.legend.episode') }}
          </span>
          <span class="flex items-center gap-1">
            <span
              class="inline-block h-3 w-3 rounded bg-surface-100 line-through"
              aria-hidden="true"
            />
            {{ t('schedule.legend.past') }}
          </span>
        </div>
      </template>

      <template v-else>
        <div v-if="loading && items.length === 0" class="flex flex-col gap-3">
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
        </div>
        <div
          v-else-if="items.length === 0"
          class="rounded-lg border border-dashed border-surface-300 bg-surface-0 py-12 text-center"
        >
          <i class="pi pi-calendar text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('schedule.empty.title') }}</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted-color">
            {{ t('schedule.empty.hint') }}
          </p>
        </div>
        <ScheduleAgendaList v-else :items="items" @open-item="openItem" />
      </template>
    </template>

    <Dialog
      :visible="dayKey !== null"
      modal
      :header="dayTitle"
      :style="{ width: 'min(36rem, 95vw)' }"
      @update:visible="dayKey = null"
    >
      <ScheduleAgendaList :items="dayItems" @open-item="openItem" />
    </Dialog>
  </div>
</template>
