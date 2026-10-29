<script setup lang="ts">
import { computed } from 'vue'
import { formatCount, formatPercent, type StatTile } from '../../utils/stats'

/**
 * KPI tile (dataviz skill: label in sentence case, value in semibold sans with proportional
 * figures, optional secondary hint in muted ink; never a one-bar chart).
 */
const props = defineProps<{ tile: StatTile; loading?: boolean }>()
const { t, locale } = useI18n()

const value = computed(() =>
  props.tile.format === 'percent'
    ? formatPercent(props.tile.value, locale.value)
    : formatCount(props.tile.value, locale.value),
)
const hint = computed(() => {
  if (props.tile.format === 'percent' && props.tile.value === null) {
    return t('dashboard.hints.noStarts')
  }
  if (!props.tile.hint || props.tile.hint.value === null) return null
  return t(`dashboard.hints.${props.tile.hint.key}`, {
    percent: formatPercent(props.tile.hint.value, locale.value),
  })
})
</script>

<template>
  <article
    class="flex min-h-24 flex-col justify-between rounded-lg border border-surface-200 bg-surface-0 p-4"
    :data-tile="tile.key"
  >
    <h3 class="text-sm text-muted-color">{{ t(`dashboard.tiles.${tile.key}`) }}</h3>
    <Skeleton v-if="loading && tile.value === null" height="2rem" width="5rem" class="mt-2" />
    <p v-else class="mt-1 text-3xl font-semibold leading-tight text-surface-900">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-xs text-muted-color">{{ hint }}</p>
  </article>
</template>
