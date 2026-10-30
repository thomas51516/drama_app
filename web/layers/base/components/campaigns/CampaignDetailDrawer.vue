<script setup lang="ts">
import { computed } from 'vue'
import type { AdminSeries, Campaign } from '../../types/api'
import { campaignTimeline, deliveryRate, describeSegment } from '../../utils/campaigns'
import { formatZoned } from '../../utils/schedule'

/** Right-hand drawer with the message, the target, the counters and the timeline. */
const props = defineProps<{
  visible: boolean
  campaign: Campaign | null
  seriesById: Record<string, AdminSeries>
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { t, n } = useI18n()

const segmentLabel = computed(() => {
  if (!props.campaign) return ''
  const { key, params } = describeSegment(props.campaign.segment)
  const seriesId = props.campaign.segment.seriesId
  const series = seriesId ? (props.seriesById[seriesId]?.title ?? seriesId) : ''
  const count = typeof params.days === 'number' ? params.days : 0
  return t(key, { ...params, series }, count)
})

const timeline = computed(() => (props.campaign ? campaignTimeline(props.campaign) : []))
const rate = computed(() => (props.campaign ? deliveryRate(props.campaign) : null))

function formatDate(iso: string | null): string {
  return iso ? formatZoned(iso) : '—'
}
</script>

<template>
  <Drawer
    :visible="visible"
    position="right"
    class="!w-full sm:!w-[32rem]"
    :header="t('campaigns.detail.title')"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="campaign" class="flex flex-col gap-6" data-testid="campaign-detail">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h2 class="text-lg font-semibold">{{ campaign.title }}</h2>
        <CampaignsCampaignStatusTag :status="campaign.status" />
      </div>

      <!-- Phone-style preview of the notification -->
      <section aria-labelledby="campaign-preview-title">
        <h3
          id="campaign-preview-title"
          class="mb-2 text-xs font-semibold uppercase text-muted-color"
        >
          {{ t('campaigns.detail.preview') }}
        </h3>
        <div class="rounded-xl border border-surface-200 bg-surface-100 p-3">
          <div class="rounded-lg bg-surface-0 p-3 shadow-sm">
            <div class="flex items-center gap-2 text-xs text-muted-color">
              <span
                class="flex h-4 w-4 items-center justify-center rounded bg-primary text-[9px] font-bold text-primary-contrast"
                aria-hidden="true"
                >D</span
              >
              {{ t('app.name') }}
            </div>
            <p class="mt-1 text-sm font-semibold">{{ campaign.title }}</p>
            <p class="text-sm text-surface-700">{{ campaign.body }}</p>
          </div>
        </div>
      </section>

      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div class="col-span-2">
          <dt class="text-xs uppercase text-muted-color">{{ t('campaigns.columns.segment') }}</dt>
          <dd class="font-medium">{{ segmentLabel }}</dd>
        </div>
        <div class="col-span-2">
          <dt class="text-xs uppercase text-muted-color">{{ t('campaigns.detail.deepLink') }}</dt>
          <dd>
            <code v-if="campaign.deepLink" class="text-xs">{{ campaign.deepLink }}</code>
            <span v-else class="text-muted-color">{{ t('campaigns.detail.noDeepLink') }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-muted-color">{{ t('campaigns.detail.audience') }}</dt>
          <dd class="text-xl font-semibold tabular-nums">{{ n(campaign.audienceCount) }}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-muted-color">{{ t('campaigns.detail.sent') }}</dt>
          <dd class="text-xl font-semibold tabular-nums" data-testid="sent-count">
            {{ n(campaign.sentCount) }}
            <span v-if="rate !== null" class="text-sm font-normal text-muted-color">
              ({{ n(rate, { style: 'percent', maximumFractionDigits: 0 }) }})
            </span>
          </dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-muted-color">{{ t('campaigns.detail.createdBy') }}</dt>
          <dd class="truncate" :title="campaign.createdBy">{{ campaign.createdBy }}</dd>
        </div>
        <div v-if="campaign.scheduledAt">
          <dt class="text-xs uppercase text-muted-color">
            {{ t('campaigns.detail.scheduledAt') }}
          </dt>
          <dd class="tabular-nums">{{ formatDate(campaign.scheduledAt) }}</dd>
        </div>
      </dl>

      <Message v-if="campaign.status === 'SENDING'" severity="info" :closable="false">
        {{ t('campaigns.sendingHint') }}
      </Message>

      <section aria-labelledby="campaign-timeline-title">
        <h3
          id="campaign-timeline-title"
          class="mb-2 text-xs font-semibold uppercase text-muted-color"
        >
          {{ t('campaigns.detail.timeline') }}
        </h3>
        <ol class="flex flex-col gap-3 border-l-2 border-surface-200 pl-4">
          <li v-for="event in timeline" :key="event.key" class="relative">
            <span
              class="absolute -left-[1.45rem] top-1 h-3 w-3 rounded-full border-2 border-surface-0"
              :class="event.done ? 'bg-primary' : 'bg-surface-300'"
              aria-hidden="true"
            />
            <p class="text-sm" :class="event.done ? 'font-medium' : 'text-muted-color'">
              {{ t(`campaigns.timeline.${event.key}`) }}
            </p>
            <p class="text-xs tabular-nums text-muted-color">{{ formatDate(event.at) }}</p>
          </li>
        </ol>
      </section>
    </div>
  </Drawer>
</template>
