<script setup lang="ts">
import type { AdminSeries } from '#base/types/api'

/** B-02 entry from the sidebar: episodes are managed per series, so pick one first. */
const { t } = useI18n()

function open(series: AdminSeries): void {
  void navigateTo(`/series/${series.id}/episodes`)
}
</script>

<template>
  <EpisodesSeriesPicker
    :title="t('episodes.title')"
    :hint="t('episodes.pickSeries.hint')"
    @select="open"
  />
</template>
