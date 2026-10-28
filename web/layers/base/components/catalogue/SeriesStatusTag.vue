<script setup lang="ts">
import type { SeriesStatus } from '../../types/api'

defineProps<{ status: SeriesStatus }>()
const { t } = useI18n()

const severity: Record<SeriesStatus, 'secondary' | 'success' | 'contrast'> = {
  DRAFT: 'secondary',
  PUBLISHED: 'success',
  ARCHIVED: 'contrast',
}
</script>

<template>
  <Tag :value="t(`series.status.${status}`)" :severity="severity[status]" />
</template>
