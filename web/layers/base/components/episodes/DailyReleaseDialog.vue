<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminEpisode } from '../../types/api'
import {
  addWallDays,
  dailyReleasePlan,
  formatWallDate,
  formatZoned,
  isPlannable,
  planDayCount,
  todayWallDate,
  type DailyReleaseEntry,
} from '../../utils/schedule'

/**
 * « Planifier une sortie quotidienne » (B-04): N episodes per day from a start date at a given
 * Lomé time. The plan is computed by `dailyReleasePlan()` (pure, tested) and applied with one
 * PATCH per episode; the page refreshes its list on `done`.
 */
const props = defineProps<{ episodes: readonly AdminEpisode[] }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ done: [updated: AdminEpisode[]] }>()

const { t, locale } = useI18n()
const api = useCatalogueApi()
const notify = useNotify()

const eligible = computed(() =>
  [...props.episodes].filter(isPlannable).sort((a, b) => a.number - b.number),
)
const selectedIds = ref<string[]>([])
const startDate = ref<Date | null>(null)
const time = ref<Date | null>(null)
const perDay = ref(1)
const applying = ref(false)
const progress = ref(0)

watch(visible, (open) => {
  if (!open) return
  // Defaults: every plannable episode, tomorrow at 18:00 (Lomé), one per day.
  selectedIds.value = eligible.value.map((episode) => episode.id)
  const tomorrow = addWallDays(todayWallDate(), 1)
  startDate.value = new Date(tomorrow.year, tomorrow.month - 1, tomorrow.day)
  time.value = new Date(2000, 0, 1, 18, 0, 0, 0)
  perDay.value = 1
  progress.value = 0
})

const selected = computed(() =>
  eligible.value.filter((episode) => selectedIds.value.includes(episode.id)),
)
const alreadyDated = computed(() => selected.value.filter((episode) => episode.publishedAt).length)

const plan = computed<DailyReleaseEntry[]>(() => {
  if (!startDate.value || !time.value || selected.value.length === 0) return []
  return dailyReleasePlan({
    episodes: selected.value,
    startDate: {
      year: startDate.value.getFullYear(),
      month: startDate.value.getMonth() + 1,
      day: startDate.value.getDate(),
    },
    time: { hour: time.value.getHours(), minute: time.value.getMinutes() },
    perDay: perDay.value,
  })
})
const dayCount = computed(() => planDayCount(plan.value))
const titleById = computed(() =>
  Object.fromEntries(eligible.value.map((episode) => [episode.id, episode.title])),
)
const summary = computed(() => {
  if (plan.value.length === 0) return ''
  const first = plan.value[0]!
  const last = plan.value[plan.value.length - 1]!
  return t(
    'episodes.plan.summary',
    {
      count: plan.value.length,
      days: dayCount.value,
      first: formatZoned(first.publishedAt, locale.value, undefined, 'dateTime'),
      last: formatZoned(last.publishedAt, locale.value, undefined, 'dateTime'),
    },
    plan.value.length,
  )
})
const dayLabel = (entry: DailyReleaseEntry): string => {
  if (!startDate.value) return ''
  const date = addWallDays(
    {
      year: startDate.value.getFullYear(),
      month: startDate.value.getMonth() + 1,
      day: startDate.value.getDate(),
    },
    entry.dayIndex,
  )
  return formatWallDate(date, locale.value)
}

const canApply = computed(
  () => plan.value.length > 0 && !applying.value && startDate.value !== null && time.value !== null,
)

async function apply(): Promise<void> {
  if (!canApply.value) return
  applying.value = true
  progress.value = 0
  const updated: AdminEpisode[] = []
  let failed = 0
  for (const entry of plan.value) {
    try {
      updated.push(await api.updateEpisode(entry.episodeId, { publishedAt: entry.publishedAt }))
    } catch (err) {
      failed += 1
      notify.apiError(err, t('episodes.publication.saveFailed'))
    } finally {
      progress.value += 1
    }
  }
  applying.value = false
  if (failed === 0) {
    notify.success(t('episodes.plan.done', { count: updated.length }, updated.length))
    visible.value = false
  } else {
    notify.warn(t('episodes.plan.partial', { done: updated.length, failed }))
  }
  emit('done', updated)
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('episodes.plan.title')"
    :style="{ width: 'min(48rem, 95vw)' }"
    :closable="!applying"
    :dismissable-mask="!applying"
  >
    <div class="flex flex-col gap-5">
      <p class="text-sm text-muted-color">{{ t('episodes.plan.intro', { perDay }) }}</p>

      <Message v-if="eligible.length === 0" severity="warn" :closable="false">
        {{ t('episodes.plan.noEligible') }}
      </Message>

      <template v-else>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="flex flex-col gap-1.5">
            <label for="plan-start" class="text-sm font-medium">{{
              t('episodes.plan.startDate')
            }}</label>
            <DatePicker
              v-model="startDate"
              input-id="plan-start"
              show-icon
              date-format="dd/mm/yy"
              :disabled="applying"
              fluid
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="plan-time" class="text-sm font-medium">{{ t('episodes.plan.time') }}</label>
            <DatePicker
              v-model="time"
              input-id="plan-time"
              time-only
              hour-format="24"
              :step-minute="5"
              show-icon
              icon="pi pi-clock"
              :disabled="applying"
              fluid
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="plan-per-day" class="text-sm font-medium">{{
              t('episodes.plan.perDay')
            }}</label>
            <InputNumber
              v-model="perDay"
              input-id="plan-per-day"
              :min="1"
              :max="20"
              show-buttons
              :use-grouping="false"
              :disabled="applying"
              fluid
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ t('episodes.plan.episodes') }}</span>
            <div class="flex gap-1">
              <Button
                :label="t('episodes.plan.selectAll')"
                text
                size="small"
                :disabled="applying"
                @click="selectedIds = eligible.map((e) => e.id)"
              />
              <Button
                :label="t('episodes.plan.selectNone')"
                text
                size="small"
                severity="secondary"
                :disabled="applying"
                @click="selectedIds = []"
              />
            </div>
          </div>
          <div
            class="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-surface-200 p-2 sm:grid-cols-2"
          >
            <label
              v-for="episode in eligible"
              :key="episode.id"
              class="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-100"
            >
              <Checkbox
                v-model="selectedIds"
                :value="episode.id"
                :input-id="`plan-ep-${episode.id}`"
                :disabled="applying"
              />
              <span class="truncate">{{ episode.number }}. {{ episode.title }}</span>
              <EpisodesEpisodeStatusTag :status="episode.transcodeStatus" class="ml-auto" />
            </label>
          </div>
          <small class="text-xs text-muted-color">{{ t('episodes.plan.eligibleHint') }}</small>
          <Message v-if="alreadyDated > 0" severity="warn" :closable="false" size="small">
            {{ t('episodes.plan.overwriteWarning', { count: alreadyDated }, alreadyDated) }}
          </Message>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{{ t('episodes.plan.preview') }}</span>
          <p v-if="plan.length === 0" class="text-sm text-muted-color">
            {{ t('episodes.plan.none') }}
          </p>
          <template v-else>
            <p class="text-sm">{{ summary }}</p>
            <DataTable
              :value="plan"
              data-key="episodeId"
              size="small"
              scrollable
              scroll-height="14rem"
              class="rounded-md border border-surface-200"
            >
              <Column :header="t('episodes.plan.columns.day')" class="w-20">
                <template #body="{ data: row }: { data: DailyReleaseEntry }">
                  <span class="tabular-nums">J+{{ row.dayIndex }}</span>
                  <span class="sr-only">{{ dayLabel(row) }}</span>
                </template>
              </Column>
              <Column :header="t('episodes.plan.columns.episode')">
                <template #body="{ data: row }: { data: DailyReleaseEntry }">
                  <span class="tabular-nums font-medium">{{ row.number }}.</span>
                  {{ titleById[row.episodeId] }}
                </template>
              </Column>
              <Column :header="t('episodes.plan.columns.publishedAt')" class="w-52">
                <template #body="{ data: row }: { data: DailyReleaseEntry }">
                  <time :datetime="row.publishedAt">{{
                    formatZoned(row.publishedAt, locale)
                  }}</time>
                </template>
              </Column>
            </DataTable>
          </template>
        </div>

        <ProgressBar
          v-if="applying"
          :value="Math.round((progress / Math.max(1, plan.length)) * 100)"
          :show-value="false"
          style="height: 0.375rem"
        />
      </template>
    </div>

    <template #footer>
      <Button
        :label="t('common.cancel')"
        severity="secondary"
        text
        :disabled="applying"
        @click="visible = false"
      />
      <Button
        :label="t('episodes.plan.confirm', { count: plan.length }, plan.length)"
        icon="pi pi-calendar-plus"
        :loading="applying"
        :disabled="!canApply"
        data-testid="plan-confirm"
        @click="apply"
      />
    </template>
  </Dialog>
</template>
