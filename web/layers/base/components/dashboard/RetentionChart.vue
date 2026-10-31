<script setup lang="ts">
import { computed } from 'vue'
import type { StatsRetentionPoint } from '../../types/api'
import { formatCount, retentionChartData, STATS_SERIES_COLORS } from '../../utils/stats'

/**
 * Retention curve (B-11, sprint 9): a line, one series (% of the episode-1 cohort still present
 * at episode N) — a single series needs no legend box, the figure title names it. Dataviz rules
 * applied: validated hue (reused `STATS_SERIES_COLORS.viewers`), 2px line, 4px markers that grow
 * on hover, recessive grid, hover tooltip with both the percentage and the raw viewer count.
 */
const props = defineProps<{ points: readonly StatsRetentionPoint[] }>()
const { t, locale } = useI18n()

const INK_SECONDARY = '#52514e'
const GRID = '#e7e5e4'

const chart = computed(() => retentionChartData(props.points))

const data = computed(() => ({
  labels: chart.value.episodeNumbers.map((n) => t('dashboard.retention.episodeShort', { n })),
  datasets: [
    {
      data: chart.value.retentionPercent,
      borderColor: STATS_SERIES_COLORS.viewers,
      backgroundColor: STATS_SERIES_COLORS.viewers,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: STATS_SERIES_COLORS.viewers,
      tension: 0,
      fill: false,
    },
  ],
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (context: { dataIndex: number; parsed: { y: number } }) => {
          const viewers = chart.value.viewers[context.dataIndex] ?? 0
          return ` ${t('dashboard.retention.tooltip', {
            percent: context.parsed.y.toFixed(0),
            viewers: formatCount(viewers, locale.value),
          })}`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: INK_SECONDARY },
    },
    y: {
      beginAtZero: true,
      max: 100,
      grid: { color: GRID, drawTicks: false },
      border: { display: false },
      ticks: {
        color: INK_SECONDARY,
        callback: (value: string | number) => `${value} %`,
      },
    },
  },
}))
</script>

<template>
  <figure
    class="rounded-lg border border-surface-200 bg-surface-0 p-4"
    role="img"
    :aria-label="t('dashboard.retention.chartAria')"
  >
    <Chart type="line" :data="data" :options="options" style="height: 16rem" />
  </figure>
</template>
