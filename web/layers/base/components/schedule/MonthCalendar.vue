<script setup lang="ts">
import { computed } from 'vue'
import type { ScheduleItem } from '../../types/api'
import {
  formatTime,
  groupByDay,
  monthGrid,
  publicationState,
  weekdayLabels,
  type CalendarDay,
} from '../../utils/schedule'

/**
 * Month grid of the planning (B-04): six weeks, Monday first, items as chips (series in the
 * primary colour, episodes in a neutral one, past dates muted). At most `maxPerCell` chips are
 * shown per day; the rest collapses into a « + n » button that opens the day.
 */
const props = withDefaults(
  defineProps<{
    year: number
    month: number
    items: readonly ScheduleItem[]
    loading?: boolean
    maxPerCell?: number
  }>(),
  { loading: false, maxPerCell: 3 },
)
const emit = defineEmits<{ openItem: [item: ScheduleItem]; openDay: [key: string] }>()

const { t, locale } = useI18n()

const grid = computed(() => monthGrid(props.year, props.month))
const weekdays = computed(() => weekdayLabels(locale.value))
const byDay = computed<Record<string, ScheduleItem[]>>(() =>
  Object.fromEntries(groupByDay(props.items).map((group) => [group.key, group.items])),
)

function itemsOf(day: CalendarDay): ScheduleItem[] {
  return byDay.value[day.key] ?? []
}

function chipLabel(item: ScheduleItem): string {
  return item.kind === 'EPISODE'
    ? `${item.seriesTitle} · ${t('schedule.episodeLabel', { number: item.episodeNumber ?? '' })}`
    : item.title
}

function chipTitle(item: ScheduleItem): string {
  const base = `${formatTime(item.publishedAt)} — ${chipLabel(item)}`
  return item.willBeVisible === false ? `${base} (${t('schedule.notVisible')})` : base
}

function chipClass(item: ScheduleItem): string {
  const past = publicationState(item.publishedAt) !== 'scheduled'
  if (past) return 'bg-surface-100 text-muted-color line-through decoration-surface-400'
  return item.kind === 'SERIES'
    ? 'bg-primary-100 text-primary-800 hover:bg-primary-200'
    : 'bg-surface-200 text-surface-800 hover:bg-surface-300'
}
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-surface-200 bg-surface-0"
    role="grid"
    :aria-busy="loading"
  >
    <div
      class="grid grid-cols-7 border-b border-surface-200 bg-surface-50 text-center text-xs font-medium uppercase tracking-wide text-muted-color"
      role="row"
    >
      <div v-for="label in weekdays" :key="label" class="py-2" role="columnheader">{{ label }}</div>
    </div>

    <div v-for="(week, index) in grid.weeks" :key="index" class="grid grid-cols-7" role="row">
      <div
        v-for="day in week"
        :key="day.key"
        role="gridcell"
        class="min-h-24 border-b border-r border-surface-100 p-1.5 last:border-r-0 sm:min-h-28"
        :class="day.inMonth ? '' : 'bg-surface-50/60'"
        :data-day="day.key"
      >
        <div class="mb-1 flex items-center justify-between">
          <span
            class="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums"
            :class="[
              day.isToday ? 'bg-primary font-semibold text-primary-contrast' : '',
              day.inMonth ? 'text-surface-900' : 'text-muted-color',
            ]"
            :aria-current="day.isToday ? 'date' : undefined"
          >
            {{ day.date.day }}
          </span>
          <span v-if="itemsOf(day).length > 0" class="sr-only">
            {{ t('schedule.count', { count: itemsOf(day).length }, itemsOf(day).length) }}
          </span>
        </div>

        <ul class="flex flex-col gap-1">
          <li v-for="item in itemsOf(day).slice(0, maxPerCell)" :key="`${item.kind}-${item.id}`">
            <button
              type="button"
              class="flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-xs transition-colors"
              :class="chipClass(item)"
              :title="chipTitle(item)"
              @click="emit('openItem', item)"
            >
              <i
                :class="item.kind === 'SERIES' ? 'pi pi-book' : 'pi pi-video'"
                class="shrink-0 text-[10px]"
                aria-hidden="true"
              />
              <span class="shrink-0 tabular-nums">{{ formatTime(item.publishedAt) }}</span>
              <span class="truncate">{{ chipLabel(item) }}</span>
              <i
                v-if="
                  item.willBeVisible === false && publicationState(item.publishedAt) === 'scheduled'
                "
                class="pi pi-exclamation-triangle ml-auto shrink-0 text-[10px] text-amber-600"
                aria-hidden="true"
              />
            </button>
          </li>
          <li v-if="itemsOf(day).length > maxPerCell">
            <button
              type="button"
              class="w-full rounded px-1.5 py-0.5 text-left text-xs text-primary hover:underline"
              @click="emit('openDay', day.key)"
            >
              {{
                t(
                  'schedule.more',
                  { count: itemsOf(day).length - maxPerCell },
                  itemsOf(day).length - maxPerCell,
                )
              }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
