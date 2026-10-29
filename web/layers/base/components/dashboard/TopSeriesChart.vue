<script setup lang="ts">
import { computed } from 'vue'
import { formatCount, topSeriesChartData, type TopSeriesRow } from '../../utils/stats'

/**
 * Horizontal grouped bars: viewers and completions per top series (B-11 v0). Built with the
 * PrimeVue `Chart` wrapper over Chart.js. Dataviz rules applied: two categorical slots in fixed
 * order (validated palette), thin bars with 4px rounded data-ends, recessive grid, legend for
 * the two series, hover tooltip, text in neutral ink; the table next to it is the accessible
 * data view.
 */
const props = defineProps<{ rows: readonly TopSeriesRow[] }>()
const { t, locale } = useI18n()

const INK_PRIMARY = '#0b0b0b'
const INK_SECONDARY = '#52514e'
const GRID = '#e7e5e4'

const data = computed(() => {
  const chart = topSeriesChartData(props.rows)
  return {
    labels: chart.labels,
    datasets: chart.datasets.map((dataset) => ({
      label: t(`dashboard.topSeries.legend.${dataset.key}`),
      data: dataset.data,
      backgroundColor: dataset.backgroundColor,
      hoverBackgroundColor: dataset.backgroundColor,
      borderRadius: { topRight: 4, bottomRight: 4, topLeft: 0, bottomLeft: 0 },
      borderSkipped: 'start' as const,
      maxBarThickness: 14,
    })),
  }
})

const options = computed(() => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  datasets: { bar: { categoryPercentage: 0.7, barPercentage: 0.85 } },
  plugins: {
    legend: {
      position: 'top' as const,
      align: 'start' as const,
      labels: { color: INK_SECONDARY, boxWidth: 10, boxHeight: 10, usePointStyle: false },
    },
    tooltip: {
      callbacks: {
        label: (context: { dataset: { label?: string }; parsed: { x: number } }) =>
          ` ${context.dataset.label ?? ''} : ${formatCount(context.parsed.x, locale.value)}`,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: GRID, drawTicks: false },
      border: { display: false },
      ticks: {
        color: INK_SECONDARY,
        maxTicksLimit: 6,
        callback: (value: string | number) => formatCount(Number(value), locale.value),
      },
    },
    y: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: INK_PRIMARY, autoSkip: false },
    },
  },
}))

/** Enough height for the grouped bars whatever the number of series (min 3 rows). */
const height = computed(() => `${Math.max(3, props.rows.length) * 48 + 56}px`)
</script>

<template>
  <figure
    class="rounded-lg border border-surface-200 bg-surface-0 p-4"
    role="img"
    :aria-label="t('dashboard.topSeries.chartAria')"
  >
    <Chart type="bar" :data="data" :options="options" :style="{ height }" />
  </figure>
</template>
