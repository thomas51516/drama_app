<script setup lang="ts">
import { computed } from 'vue'
import type { StatsRevenueBySource } from '../../types/api'
import { formatCount, formatRevenueAmount, sortRevenueRows } from '../../utils/stats'

/**
 * Revenue by source and currency (B-11, sprint 9). A table, not a chart: amounts in different
 * currencies cannot be stacked into one meaningful bar, and there are only two sources.
 */
const props = defineProps<{ rows: readonly StatsRevenueBySource[]; loading?: boolean }>()
const { t, locale } = useI18n()

const rows = computed(() =>
  sortRevenueRows(props.rows).map((row) => ({ ...row, rowKey: `${row.source}-${row.currency}` })),
)
</script>

<template>
  <div class="rounded-lg border border-surface-200 bg-surface-0">
    <DataTable :value="rows" data-key="rowKey" size="small" striped-rows :loading="loading">
      <template #empty>
        <p class="py-6 text-center text-sm text-muted-color">
          {{ t('dashboard.revenue.empty') }}
        </p>
      </template>
      <Column :header="t('dashboard.revenue.columns.source')" class="w-40">
        <template #body="{ data }: { data: StatsRevenueBySource }">
          {{ t(`dashboard.revenue.source.${data.source}`) }}
        </template>
      </Column>
      <Column :header="t('dashboard.revenue.columns.amount')" class="text-right">
        <template #body="{ data }: { data: StatsRevenueBySource }">
          <span class="tabular-nums">{{ formatRevenueAmount(data, locale) }}</span>
        </template>
      </Column>
      <Column :header="t('dashboard.revenue.columns.orders')" class="w-28 text-right">
        <template #body="{ data }: { data: StatsRevenueBySource }">
          <span class="tabular-nums">{{ formatCount(data.orderCount, locale) }}</span>
        </template>
      </Column>
    </DataTable>
    <p class="border-t border-surface-200 p-3 text-xs text-muted-color">
      {{ t('dashboard.revenue.note') }}
    </p>
  </div>
</template>
