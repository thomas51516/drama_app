<script setup lang="ts">
import { computed } from 'vue'
import type { ScheduleItem } from '../../types/api'
import { formatTime, formatWallDate, groupByDay, publicationState } from '../../utils/schedule'

/** Agenda (list) view of the planning (B-04): items grouped by day, soonest first. */
const props = defineProps<{ items: readonly ScheduleItem[] }>()
const emit = defineEmits<{ openItem: [item: ScheduleItem] }>()

const { t, locale } = useI18n()

const groups = computed(() =>
  groupByDay(props.items).map((group) => {
    const [year, month, day] = group.key.split('-').map(Number) as [number, number, number]
    return { ...group, label: formatWallDate({ year, month, day }, locale.value) }
  }),
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <section
      v-for="group in groups"
      :key="group.key"
      class="rounded-lg border border-surface-200 bg-surface-0"
      :data-day="group.key"
    >
      <h3
        class="border-b border-surface-200 px-4 py-2 text-sm font-semibold capitalize text-surface-800"
      >
        {{ group.label }}
      </h3>
      <ul class="divide-y divide-surface-100">
        <li v-for="item in group.items" :key="`${item.kind}-${item.id}`">
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-50"
            @click="emit('openItem', item)"
          >
            <span class="w-12 shrink-0 tabular-nums text-muted-color">
              {{ formatTime(item.publishedAt) }}
            </span>
            <Tag
              :value="t(`schedule.kinds.${item.kind}`)"
              :severity="item.kind === 'SERIES' ? 'primary' : 'secondary'"
              :icon="item.kind === 'SERIES' ? 'pi pi-book' : 'pi pi-video'"
              class="shrink-0"
            />
            <span class="min-w-0 flex-1 truncate">
              <template v-if="item.kind === 'EPISODE'">
                <span class="font-medium">{{ item.seriesTitle }}</span>
                <span class="text-muted-color">
                  · {{ t('schedule.episodeLabel', { number: item.episodeNumber ?? '' }) }} —
                  {{ item.title }}
                </span>
              </template>
              <span v-else class="font-medium">{{ item.title }}</span>
            </span>
            <Tag
              v-if="publicationState(item.publishedAt) !== 'scheduled'"
              :value="t('schedule.past')"
              severity="contrast"
              class="shrink-0"
            />
            <i
              v-else-if="item.willBeVisible === false"
              class="pi pi-exclamation-triangle shrink-0 text-amber-600"
              :title="t('schedule.notVisible')"
              role="img"
              :aria-label="t('schedule.notVisible')"
            />
            <i class="pi pi-angle-right text-muted-color" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
