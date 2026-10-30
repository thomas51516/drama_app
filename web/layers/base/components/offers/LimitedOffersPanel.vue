<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoinPackAdmin, LimitedOffer } from '../../types/api'
import { useOffersApi } from '../../composables/useOffersApi'
import { useNotify } from '../../composables/useNotify'
import { offerState, sortLimitedOffers } from '../../utils/offers'
import { formatZoned } from '../../utils/schedule'

/** Limited offers (M-24): bonus % on one pack between two dates (Lomé time). */
defineProps<{ packs: readonly CoinPackAdmin[] }>()
const { t, locale } = useI18n()
const api = useOffersApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-offers-limited', () =>
  api.listLimited(),
)
const offers = ref<LimitedOffer[]>(sortLimitedOffers(data.value ?? []))
watch(data, (value) => {
  if (value) offers.value = sortLimitedOffers(value)
})

const dialogVisible = ref(false)
const editing = ref<LimitedOffer | null>(null)
const busyId = ref<string | null>(null)

const liveCount = computed(
  () => offers.value.filter((offer) => offerState(offer) === 'live').length,
)

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(offer: LimitedOffer): void {
  editing.value = offer
  dialogVisible.value = true
}

function onSaved(saved: LimitedOffer): void {
  const exists = offers.value.some((offer) => offer.id === saved.id)
  offers.value = sortLimitedOffers(
    exists
      ? offers.value.map((offer) => (offer.id === saved.id ? saved : offer))
      : [...offers.value, saved],
  )
}

async function toggleActive(offer: LimitedOffer, isActive: boolean): Promise<void> {
  busyId.value = offer.id
  try {
    onSaved(await api.updateLimited(offer.id, { isActive }))
    notify.success(
      t(isActive ? 'monetization.toasts.activated' : 'monetization.toasts.deactivated'),
      t('monetization.audited'),
    )
  } catch (err) {
    notify.apiError(err, t('offers.limited.saveFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(offer: LimitedOffer): void {
  confirm.require({
    header: t('offers.limited.delete'),
    message: t('offers.limited.deleteConfirm', { title: offer.title }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(offer),
  })
}

async function remove(offer: LimitedOffer): Promise<void> {
  busyId.value = offer.id
  try {
    await api.deleteLimited(offer.id)
    offers.value = offers.value.filter((item) => item.id !== offer.id)
    notify.success(t('offers.limited.deleted'))
  } catch (err) {
    notify.apiError(err, t('offers.limited.deleteFailed'))
  } finally {
    busyId.value = null
  }
}

function period(offer: LimitedOffer): string {
  const start = offer.startsAt ? formatZoned(offer.startsAt, locale.value) : t('offers.limited.now')
  return `${start} → ${formatZoned(offer.endsAt, locale.value)}`
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="limited-offers-panel">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('offers.limited.title') }}</h2>
        <p class="mt-1 text-sm text-muted-color">
          {{
            t('offers.limited.summary', { count: offers.length, live: liveCount }, offers.length)
          }}
        </p>
      </div>
      <Button
        :label="t('offers.limited.create')"
        icon="pi pi-plus"
        size="small"
        data-testid="create-limited-offer"
        @click="openCreate"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('offers.loadError') }}</span>
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
      :value="offers"
      :loading="status === 'pending' && offers.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-tag text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('offers.limited.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('offers.limited.empty.hint') }}</p>
        </div>
      </template>

      <Column :header="t('offers.limited.columns.title')">
        <template #body="{ data: row }: { data: LimitedOffer }">
          <div class="font-medium">{{ row.title }}</div>
          <div class="text-xs text-muted-color">{{ period(row) }}</div>
        </template>
      </Column>
      <Column :header="t('offers.limited.columns.pack')" class="w-40">
        <template #body="{ data: row }: { data: LimitedOffer }">
          <span class="font-mono text-sm">{{ row.packSku }}</span>
        </template>
      </Column>
      <Column :header="t('offers.form.bonusPercent')" class="w-24 text-right">
        <template #body="{ data: row }: { data: LimitedOffer }">
          <span class="font-medium tabular-nums text-primary">+{{ row.bonusPercent }} %</span>
        </template>
      </Column>
      <Column :header="t('common.status')" class="w-32">
        <template #body="{ data: row }: { data: LimitedOffer }">
          <OffersOfferStateTag :item="row" />
        </template>
      </Column>
      <Column :header="t('monetization.form.active')" class="w-24">
        <template #body="{ data: row }: { data: LimitedOffer }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="busyId === row.id"
            :aria-label="t('monetization.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: row }: { data: LimitedOffer }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('offers.limited.edit')"
              :title="t('offers.limited.edit')"
              @click="openEdit(row)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :loading="busyId === row.id"
              :aria-label="t('offers.limited.delete')"
              :title="t('offers.limited.delete')"
              @click="askDelete(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <OffersLimitedOfferDialog
      v-model:visible="dialogVisible"
      :offer="editing"
      :packs="packs"
      @saved="onSaved"
    />
  </section>
</template>
