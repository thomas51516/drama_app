<script setup lang="ts">
import type { CampaignStatus } from '../../types/api'
import { campaignStatusSeverity } from '../../utils/campaigns'

defineProps<{ status: CampaignStatus }>()
const { t } = useI18n()

const icons: Record<CampaignStatus, string> = {
  DRAFT: 'pi pi-pencil',
  SCHEDULED: 'pi pi-calendar-clock',
  SENDING: 'pi pi-spin pi-spinner',
  SENT: 'pi pi-check',
  CANCELLED: 'pi pi-ban',
}
</script>

<template>
  <Tag
    :value="t(`campaigns.status.${status}`)"
    :severity="campaignStatusSeverity(status)"
    :icon="icons[status]"
  />
</template>
