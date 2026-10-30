<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { AdminSeries, Campaign, CampaignStatus } from '#base/types/api'
import { CAMPAIGN_STATUSES } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import {
  canCancelCampaign,
  canDeleteCampaign,
  canEditCampaign,
  canManageCampaigns,
  canSendCampaign,
  countByStatus,
  describeSegment,
  isCampaignStatus,
  sortCampaigns,
  statusAfterSend,
} from '#base/utils/campaigns'
import { createPoller } from '#base/utils/polling'
import { formatZoned } from '#base/utils/schedule'

/**
 * B-10 — push campaigns. MONETIZATION and ADMIN only (contract v1.3): other roles see
 * « Droits insuffisants » without an API call.
 */
const { t, n } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const api = useCampaignsApi()
const catalogue = useCatalogueApi()
const notify = useNotify()
const confirm = useConfirm()

const allowed = computed(() => canManageCampaigns(auth.user?.role))

const statusFilter = ref<CampaignStatus | null>(
  isCampaignStatus(route.query.status) ? route.query.status : null,
)
watch(statusFilter, (value) => {
  void router.replace({ query: { ...route.query, status: value ?? undefined } })
})

const { data, status, error, refresh } = useAsyncData(
  'admin-campaigns',
  () => (allowed.value ? api.listCampaigns() : Promise.resolve([] as Campaign[])),
  { watch: [allowed] },
)
const campaigns = ref<Campaign[]>(sortCampaigns(data.value ?? []))
watch(data, (value) => {
  if (value) campaigns.value = sortCampaigns(value)
})
const forbidden = computed(
  () => !allowed.value || (ApiError.is(error.value) && error.value.status === 403),
)

const counts = computed(() => countByStatus(campaigns.value))
const visible = computed(() =>
  statusFilter.value
    ? campaigns.value.filter((campaign) => campaign.status === statusFilter.value)
    : campaigns.value,
)
const statusOptions = CAMPAIGN_STATUSES.map((value) => ({
  value,
  label: t(`campaigns.status.${value}`),
}))

// Series titles for the segment column, the pickers and the drawer.
const { data: seriesPage } = useAsyncData('admin-campaigns-series', () =>
  allowed.value
    ? catalogue.listSeries({ page: 1, pageSize: 100 })
    : Promise.resolve({ items: [] as AdminSeries[], total: 0, page: 1, pageSize: 100 }),
)
const extra = ref<Record<string, AdminSeries>>({})
const seriesById = computed<Record<string, AdminSeries>>(() => ({
  ...Object.fromEntries((seriesPage.value?.items ?? []).map((series) => [series.id, series])),
  ...extra.value,
}))
function remember(series: AdminSeries): void {
  extra.value = { ...extra.value, [series.id]: series }
}

function segmentLabel(campaign: Campaign): string {
  const { key, params } = describeSegment(campaign.segment)
  const seriesId = campaign.segment.seriesId
  const series = seriesId ? (seriesById.value[seriesId]?.title ?? seriesId) : ''
  const count = typeof params.days === 'number' ? params.days : 0
  return t(key, { ...params, series }, count)
}

function dateOf(campaign: Campaign): string {
  const iso = campaign.sentAt ?? campaign.scheduledAt ?? campaign.createdAt
  return formatZoned(iso)
}

// Dialog / drawer state
const dialogVisible = ref(false)
const editing = ref<Campaign | null>(null)
const detailVisible = ref(false)
const detail = ref<Campaign | null>(null)
const busyId = ref<string | null>(null)
const estimates = ref<Record<string, number | 'pending'>>({})

function upsert(saved: Campaign): void {
  const exists = campaigns.value.some((campaign) => campaign.id === saved.id)
  campaigns.value = sortCampaigns(
    exists
      ? campaigns.value.map((campaign) => (campaign.id === saved.id ? saved : campaign))
      : [saved, ...campaigns.value],
  )
  if (detail.value?.id === saved.id) detail.value = saved
}

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(campaign: Campaign): void {
  editing.value = campaign
  dialogVisible.value = true
}

function openDetail(campaign: Campaign): void {
  detail.value = campaign
  detailVisible.value = true
}

async function estimate(campaign: Campaign): Promise<number | null> {
  estimates.value = { ...estimates.value, [campaign.id]: 'pending' }
  try {
    const { audienceCount } = await api.estimateCampaign(campaign.id)
    estimates.value = { ...estimates.value, [campaign.id]: audienceCount }
    upsert({ ...campaign, audienceCount })
    return audienceCount
  } catch (err) {
    const { [campaign.id]: _removed, ...rest } = estimates.value
    estimates.value = rest
    notify.apiError(err, t('campaigns.estimate.failed'))
    return null
  }
}

async function askSend(campaign: Campaign): Promise<void> {
  busyId.value = campaign.id
  const audience = await estimate(campaign)
  busyId.value = null
  if (audience === null) return
  const scheduled = statusAfterSend(campaign.scheduledAt) === 'SCHEDULED'
  confirm.require({
    header: t(scheduled ? 'campaigns.sendConfirm.headerScheduled' : 'campaigns.sendConfirm.header'),
    message: scheduled
      ? t('campaigns.sendConfirm.messageScheduled', {
          title: campaign.title,
          date: formatZoned(campaign.scheduledAt as string),
          count: n(audience),
        })
      : t('campaigns.sendConfirm.message', { title: campaign.title, count: n(audience) }),
    icon: 'pi pi-send',
    acceptLabel: t(scheduled ? 'campaigns.actions.schedule' : 'campaigns.actions.send'),
    rejectLabel: t('common.cancel'),
    accept: () => void send(campaign, scheduled),
  })
}

async function send(campaign: Campaign, scheduled: boolean): Promise<void> {
  busyId.value = campaign.id
  try {
    upsert(await api.sendCampaign(campaign.id))
    notify.success(t(scheduled ? 'campaigns.toasts.scheduled' : 'campaigns.toasts.sent'))
    poller.start()
  } catch (err) {
    notify.apiError(err, t('campaigns.toasts.actionFailed'))
  } finally {
    busyId.value = null
  }
}

function askCancel(campaign: Campaign): void {
  confirm.require({
    header: t('campaigns.cancelConfirm.header'),
    message: t('campaigns.cancelConfirm.message', { title: campaign.title }),
    icon: 'pi pi-ban',
    acceptLabel: t('campaigns.actions.cancel'),
    rejectLabel: t('common.back'),
    acceptProps: { severity: 'danger' },
    accept: () => void cancel(campaign),
  })
}

async function cancel(campaign: Campaign): Promise<void> {
  busyId.value = campaign.id
  try {
    upsert(await api.cancelCampaign(campaign.id))
    notify.success(t('campaigns.toasts.cancelled'))
  } catch (err) {
    notify.apiError(err, t('campaigns.toasts.actionFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(campaign: Campaign): void {
  confirm.require({
    header: t('campaigns.deleteConfirm.header'),
    message: t('campaigns.deleteConfirm.message', { title: campaign.title }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(campaign),
  })
}

async function remove(campaign: Campaign): Promise<void> {
  busyId.value = campaign.id
  try {
    await api.deleteCampaign(campaign.id)
    campaigns.value = campaigns.value.filter((item) => item.id !== campaign.id)
    if (detail.value?.id === campaign.id) detailVisible.value = false
    notify.success(t('campaigns.toasts.deleted'))
  } catch (err) {
    notify.apiError(err, t('campaigns.toasts.actionFailed'))
  } finally {
    busyId.value = null
  }
}

// While a campaign is SENDING (or due), reload every 5 s so sentCount moves.
const poller = createPoller({
  intervalMs: 5000,
  task: async () => {
    await refresh()
    return campaigns.value.some(
      (campaign) =>
        campaign.status === 'SENDING' ||
        (campaign.status === 'SCHEDULED' &&
          campaign.scheduledAt !== null &&
          new Date(campaign.scheduledAt).getTime() - Date.now() < 60_000),
    )
  },
})
watch(
  campaigns,
  (list) => {
    if (list.some((campaign) => campaign.status === 'SENDING')) poller.start()
  },
  { immediate: true },
)
onBeforeUnmount(() => poller.stop())
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('campaigns.title')"
      :subtitle="t('campaigns.subtitle')"
      :crumbs="[{ label: t('nav.notifications') }]"
    >
      <template v-if="!forbidden" #actions>
        <Button
          :label="t('common.refresh')"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          size="small"
          :loading="status === 'pending'"
          @click="refresh()"
        />
        <Button :label="t('campaigns.create')" icon="pi pi-plus" size="small" @click="openCreate" />
      </template>
    </LayoutPageHeader>

    <LayoutForbidden v-if="forbidden" :hint="t('campaigns.restricted')" />

    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2" data-testid="status-counts">
          <button
            v-for="statusKey in CAMPAIGN_STATUSES"
            :key="statusKey"
            type="button"
            class="rounded-full"
            :class="statusFilter === statusKey ? 'ring-2 ring-primary ring-offset-1' : ''"
            :aria-pressed="statusFilter === statusKey"
            @click="statusFilter = statusFilter === statusKey ? null : statusKey"
          >
            <Tag
              :value="`${t(`campaigns.status.${statusKey}`)} · ${counts[statusKey]}`"
              :severity="
                statusKey === 'DRAFT'
                  ? 'secondary'
                  : statusKey === 'SCHEDULED'
                    ? 'info'
                    : statusKey === 'SENDING'
                      ? 'warn'
                      : statusKey === 'SENT'
                        ? 'success'
                        : 'danger'
              "
              rounded
            />
          </button>
        </div>
        <Select
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          :placeholder="t('campaigns.filters.all')"
          show-clear
          class="w-56"
          :aria-label="t('campaigns.filters.status')"
        />
      </div>

      <Message v-if="error" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('campaigns.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="refresh()"
          />
        </div>
      </Message>

      <DataTable
        :value="visible"
        :loading="status === 'pending' && campaigns.length === 0"
        data-key="id"
        striped-rows
        class="rounded-lg border border-surface-200 bg-surface-0"
        data-testid="campaigns-table"
      >
        <template #empty>
          <div class="py-12 text-center">
            <i class="pi pi-bell text-3xl text-muted-color" aria-hidden="true" />
            <p class="mt-3 font-medium">{{ t('campaigns.empty.title') }}</p>
            <p class="mt-1 text-sm text-muted-color">{{ t('campaigns.empty.hint') }}</p>
          </div>
        </template>

        <Column :header="t('campaigns.columns.title')">
          <template #body="{ data: campaign }: { data: Campaign }">
            <button type="button" class="text-left hover:underline" @click="openDetail(campaign)">
              <span class="block font-medium">{{ campaign.title }}</span>
              <span class="line-clamp-1 text-xs text-muted-color">{{ campaign.body }}</span>
            </button>
          </template>
        </Column>
        <Column :header="t('campaigns.columns.segment')" class="w-56">
          <template #body="{ data: campaign }: { data: Campaign }">
            <span class="line-clamp-2 text-sm" :title="segmentLabel(campaign)">{{
              segmentLabel(campaign)
            }}</span>
          </template>
        </Column>
        <Column :header="t('campaigns.columns.status')" class="w-40">
          <template #body="{ data: campaign }: { data: Campaign }">
            <CampaignsCampaignStatusTag :status="campaign.status" />
          </template>
        </Column>
        <Column :header="t('campaigns.columns.audience')" class="w-28 text-right">
          <template #body="{ data: campaign }: { data: Campaign }">
            <span v-if="estimates[campaign.id] === 'pending'" class="text-xs text-muted-color">
              {{ t('campaigns.estimate.pending') }}
            </span>
            <span v-else class="tabular-nums">{{ n(campaign.audienceCount) }}</span>
          </template>
        </Column>
        <Column :header="t('campaigns.columns.sent')" class="w-24 text-right">
          <template #body="{ data: campaign }: { data: Campaign }">
            <span class="tabular-nums">{{ n(campaign.sentCount) }}</span>
          </template>
        </Column>
        <Column :header="t('campaigns.columns.date')" class="w-44">
          <template #body="{ data: campaign }: { data: Campaign }">
            <span class="text-sm tabular-nums">{{ dateOf(campaign) }}</span>
          </template>
        </Column>
        <Column class="w-56">
          <template #body="{ data: campaign }: { data: Campaign }">
            <div class="flex justify-end gap-1">
              <Button
                icon="pi pi-calculator"
                size="small"
                text
                :loading="estimates[campaign.id] === 'pending'"
                :aria-label="t('campaigns.actions.estimate')"
                :title="t('campaigns.actions.estimate')"
                @click="estimate(campaign)"
              />
              <Button
                v-if="canEditCampaign(campaign.status)"
                icon="pi pi-pencil"
                size="small"
                text
                :aria-label="t('campaigns.actions.edit')"
                :title="t('campaigns.actions.edit')"
                @click="openEdit(campaign)"
              />
              <Button
                v-if="canSendCampaign(campaign.status)"
                icon="pi pi-send"
                size="small"
                :label="
                  statusAfterSend(campaign.scheduledAt) === 'SCHEDULED'
                    ? t('campaigns.actions.schedule')
                    : t('campaigns.actions.send')
                "
                :loading="busyId === campaign.id"
                @click="askSend(campaign)"
              />
              <Button
                v-if="canCancelCampaign(campaign.status)"
                icon="pi pi-ban"
                size="small"
                severity="danger"
                outlined
                :label="t('campaigns.actions.cancel')"
                :loading="busyId === campaign.id"
                @click="askCancel(campaign)"
              />
              <Button
                v-if="canDeleteCampaign(campaign.status)"
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                :loading="busyId === campaign.id"
                :aria-label="t('campaigns.actions.delete')"
                :title="t('campaigns.actions.delete')"
                @click="askDelete(campaign)"
              />
              <Button
                icon="pi pi-info-circle"
                size="small"
                text
                severity="secondary"
                :aria-label="t('campaigns.actions.details')"
                :title="t('campaigns.actions.details')"
                @click="openDetail(campaign)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <CampaignsCampaignDialog
      v-model:visible="dialogVisible"
      :campaign="editing"
      :series-by-id="seriesById"
      @saved="upsert"
      @resolved="remember"
    />
    <CampaignsCampaignDetailDrawer
      v-model:visible="detailVisible"
      :campaign="detail"
      :series-by-id="seriesById"
    />
  </div>
</template>
