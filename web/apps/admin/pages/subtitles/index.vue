<script setup lang="ts">
import type { AdminSeries } from '#base/types/api'

/** B-03 entry from the sidebar: subtitles are managed per episode, from the episodes page of a series. */
const { t } = useI18n()

function open(series: AdminSeries): void {
  void navigateTo(`/series/${series.id}/episodes`)
}
</script>

<template>
  <EpisodesSeriesPicker
    :title="t('subtitles.title')"
    :hint="t('subtitles.pickSeries.hint')"
    @select="open"
  />
</template>
