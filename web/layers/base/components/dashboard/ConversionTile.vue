<script setup lang="ts">
import { computed } from 'vue'
import { formatCount, formatPercent } from '../../utils/stats'

/**
 * Paywall conversion tile (B-11, sprint 9): same KPI-tile anatomy as `StatTile`, with a two-count
 * hint instead of a single share. `conversionRate: null` means no paywall views on the window
 * (undefined ratio), not zero.
 */
const props = defineProps<{
  conversionRate: number | null
  paywallViewers: number
  convertedViewers: number
  windowHours: number
  loading?: boolean
}>()
const { t, locale } = useI18n()

const value = computed(() => formatPercent(props.conversionRate, locale.value))
</script>

<template>
  <article
    class="flex min-h-24 flex-col justify-between rounded-lg border border-surface-200 bg-surface-0 p-4"
    data-tile="paywallConversion"
  >
    <h3 class="text-sm text-muted-color">{{ t('dashboard.conversion.title') }}</h3>
    <Skeleton v-if="loading" height="2rem" width="5rem" class="mt-2" />
    <template v-else>
      <p class="mt-1 text-3xl font-semibold leading-tight text-surface-900">{{ value }}</p>
      <p class="mt-1 text-xs text-muted-color">
        {{
          paywallViewers > 0
            ? t('dashboard.conversion.hint', {
                converted: formatCount(convertedViewers, locale),
                viewers: formatCount(paywallViewers, locale),
                hours: windowHours,
              })
            : t('dashboard.conversion.noViews')
        }}
      </p>
    </template>
  </article>
</template>
