<script setup lang="ts">
import { computed } from 'vue'
import { formatZoned, publicationState } from '../../utils/schedule'

/**
 * Publication state of an episode or a series (B-04): « Programmé le … » for a future date,
 * « Publié le … » for a past one, a muted dash when unscheduled. Dates in Lomé time.
 */
const props = defineProps<{ publishedAt: string | null | undefined }>()
const { t, locale } = useI18n()

const state = computed(() => publicationState(props.publishedAt))
const label = computed(() => {
  if (!props.publishedAt || state.value === 'none') return t('episodes.publication.unscheduled')
  const date = formatZoned(props.publishedAt, locale.value)
  return state.value === 'scheduled'
    ? t('episodes.publication.scheduled', { date })
    : t('episodes.publication.published', { date })
})
</script>

<template>
  <Tag
    v-if="state === 'scheduled'"
    :value="label"
    severity="info"
    icon="pi pi-calendar-clock"
    data-testid="publication-scheduled"
  />
  <time
    v-else-if="state === 'published' && publishedAt"
    :datetime="publishedAt"
    class="text-sm"
    :title="label"
  >
    {{ formatZoned(publishedAt, locale) }}
  </time>
  <span v-else class="text-muted-color" :title="label">—</span>
</template>
