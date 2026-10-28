<script setup lang="ts">
import type { TranscodeStatus } from '../../types/api'

defineProps<{ status: TranscodeStatus; error?: string | null }>()
const { t } = useI18n()

const severity: Record<TranscodeStatus, 'secondary' | 'info' | 'warn' | 'success' | 'danger'> = {
  PENDING: 'secondary',
  UPLOADED: 'info',
  PROCESSING: 'warn',
  READY: 'success',
  FAILED: 'danger',
}

const icon: Partial<Record<TranscodeStatus, string>> = {
  PROCESSING: 'pi pi-spin pi-spinner',
  FAILED: 'pi pi-exclamation-triangle',
  READY: 'pi pi-check',
}
</script>

<template>
  <Tag
    :value="t(`episodes.status.${status}`)"
    :severity="severity[status]"
    :icon="icon[status]"
    :title="status === 'FAILED' && error ? error : undefined"
  />
</template>
