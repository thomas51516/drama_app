<script setup lang="ts">
import type { RightsStatus } from '../../types/api'
import { rightsStatusSeverity } from '../../utils/rights'

defineProps<{ status: RightsStatus }>()
const { t } = useI18n()
</script>

<template>
  <Tag :value="t(`rights.status.${status}`)" :severity="rightsStatusSeverity(status)" />
</template>
