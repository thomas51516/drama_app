<script setup lang="ts">
import type { TopupOrderStatus } from '../../types/api'
import { orderStatusSeverity } from '../../utils/topup'

defineProps<{ status: TopupOrderStatus }>()
const { t } = useI18n()
</script>

<template>
  <Tag
    :value="t(`recharge.status.${status}`)"
    :severity="orderStatusSeverity(status)"
    :data-status="status"
  />
</template>
