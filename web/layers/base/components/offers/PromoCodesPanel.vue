<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PromoCode } from '../../types/api'
import { useOffersApi } from '../../composables/useOffersApi'
import { useNotify } from '../../composables/useNotify'
import { isPromoExhausted, offerState, promoUsageRatio, sortPromoCodes } from '../../utils/offers'
import { formatZoned } from '../../utils/schedule'

/** Promo codes (M-24): coins offered once per user, with quotas, dates and redemptions. */
const { t, n, locale } = useI18n()
const api = useOffersApi()
const notify = useNotify()

const { data, status, error, refresh } = useAsyncData('admin-promo-codes', () =>
  api.listPromoCodes(),
)
const codes = ref<PromoCode[]>(sortPromoCodes(data.value ?? []))
watch(data, (value) => {
  if (value) codes.value = sortPromoCodes(value)
})

const dialogVisible = ref(false)
const editing = ref<PromoCode | null>(null)
const drawerVisible = ref(false)
const inspecting = ref<PromoCode | null>(null)
const busyId = ref<string | null>(null)
const copiedId = ref<string | null>(null)

const liveCount = computed(
  () =>
    codes.value.filter((promo) => offerState(promo) === 'live' && !isPromoExhausted(promo)).length,
)

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(promo: PromoCode): void {
  editing.value = promo
  dialogVisible.value = true
}

function openRedemptions(promo: PromoCode): void {
  inspecting.value = promo
  drawerVisible.value = true
}

function onSaved(saved: PromoCode): void {
  const exists = codes.value.some((promo) => promo.id === saved.id)
  codes.value = sortPromoCodes(
    exists
      ? codes.value.map((promo) => (promo.id === saved.id ? saved : promo))
      : [...codes.value, saved],
  )
}

async function toggleActive(promo: PromoCode, isActive: boolean): Promise<void> {
  busyId.value = promo.id
  try {
    onSaved(await api.updatePromoCode(promo.id, { isActive }))
    notify.success(
      t(isActive ? 'monetization.toasts.activated' : 'monetization.toasts.deactivated'),
      t('monetization.audited'),
    )
  } catch (err) {
    notify.apiError(err, t('offers.promo.saveFailed'))
  } finally {
    busyId.value = null
  }
}

async function copyCode(promo: PromoCode): Promise<void> {
  try {
    await navigator.clipboard.writeText(promo.code)
    copiedId.value = promo.id
    setTimeout(() => {
      if (copiedId.value === promo.id) copiedId.value = null
    }, 2000)
  } catch {
    notify.warn(t('offers.promo.copyFailed'))
  }
}

function usageLabel(promo: PromoCode): string {
  return promo.maxUses === null
    ? t('offers.promo.usageUnlimited', { used: n(promo.usesCount) })
    : t('offers.promo.usage', { used: n(promo.usesCount), max: n(promo.maxUses) })
}

function validity(promo: PromoCode): string {
  if (!promo.startsAt && !promo.endsAt) return t('offers.promo.noDates')
  const start = promo.startsAt ? formatZoned(promo.startsAt, locale.value, undefined, 'date') : '…'
  const end = promo.endsAt ? formatZoned(promo.endsAt, locale.value, undefined, 'date') : '…'
  return `${start} → ${end}`
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="promo-codes-panel">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ t('offers.promo.title') }}</h2>
        <p class="mt-1 text-sm text-muted-color">
          {{ t('offers.promo.summary', { count: codes.length, live: liveCount }, codes.length) }}
        </p>
      </div>
      <Button
        :label="t('offers.promo.create')"
        icon="pi pi-plus"
        size="small"
        data-testid="create-promo-code"
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
      :value="codes"
      :loading="status === 'pending' && codes.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-ticket text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('offers.promo.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('offers.promo.empty.hint') }}</p>
        </div>
      </template>

      <Column :header="t('offers.promo.columns.code')">
        <template #body="{ data: row }: { data: PromoCode }">
          <div class="flex items-center gap-1">
            <code class="font-mono text-sm font-semibold">{{ row.code }}</code>
            <Button
              :icon="copiedId === row.id ? 'pi pi-check' : 'pi pi-copy'"
              size="small"
              text
              severity="secondary"
              :aria-label="t('common.copy')"
              :title="copiedId === row.id ? t('common.copied') : t('common.copy')"
              @click="copyCode(row)"
            />
          </div>
          <div class="text-xs text-muted-color">{{ validity(row) }}</div>
        </template>
      </Column>
      <Column :header="t('offers.promo.columns.coins')" class="w-24 text-right">
        <template #body="{ data: row }: { data: PromoCode }">
          <span class="font-medium tabular-nums text-primary">+{{ n(row.coins) }}</span>
        </template>
      </Column>
      <Column :header="t('offers.promo.columns.usage')" class="w-48">
        <template #body="{ data: row }: { data: PromoCode }">
          <div class="text-sm tabular-nums">{{ usageLabel(row) }}</div>
          <ProgressBar
            v-if="promoUsageRatio(row) !== null"
            :value="Math.round((promoUsageRatio(row) ?? 0) * 100)"
            :show-value="false"
            class="mt-1 !h-1.5"
            :aria-label="usageLabel(row)"
          />
          <div class="text-xs text-muted-color">
            {{ t('offers.promo.perUser', { count: row.perUserUses }, row.perUserUses) }}
          </div>
        </template>
      </Column>
      <Column :header="t('common.status')" class="w-32">
        <template #body="{ data: row }: { data: PromoCode }">
          <OffersOfferStateTag :item="row" :exhausted="isPromoExhausted(row)" />
        </template>
      </Column>
      <Column :header="t('monetization.form.active')" class="w-24">
        <template #body="{ data: row }: { data: PromoCode }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="busyId === row.id"
            :aria-label="t('monetization.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: row }: { data: PromoCode }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-users"
              size="small"
              text
              :aria-label="t('offers.promo.redemptions')"
              :title="t('offers.promo.redemptions')"
              :data-testid="`redemptions-${row.code}`"
              @click="openRedemptions(row)"
            />
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('offers.promo.edit')"
              :title="t('offers.promo.edit')"
              @click="openEdit(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <OffersPromoCodeDialog v-model:visible="dialogVisible" :promo="editing" @saved="onSaved" />
    <OffersRedemptionsDrawer v-model:visible="drawerVisible" :promo="inspecting" />
  </section>
</template>
