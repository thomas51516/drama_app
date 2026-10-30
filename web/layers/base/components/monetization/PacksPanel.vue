<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoinPackAdmin, Price } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { useNotify } from '../../composables/useNotify'
import { orderIds, sortByPosition, withPositions } from '../../utils/featured'
import { formatPrice } from '../../utils/monetization'

/** Coin packs tab (B-06): ordered table with drag-and-drop, inline activation, create / edit / delete. */
const { t, n, locale } = useI18n()
const api = useMonetizationApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-monetization-packs', () =>
  api.listPacks(),
)
const packs = ref<CoinPackAdmin[]>(sortByPosition(data.value ?? []))
watch(data, (value) => {
  if (value) packs.value = sortByPosition(value)
})

const dialogVisible = ref(false)
const editing = ref<CoinPackAdmin | null>(null)
const busyId = ref<string | null>(null)
const reordering = ref(false)

const activeCount = computed(() => packs.value.filter((pack) => pack.isActive).length)

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(pack: CoinPackAdmin): void {
  editing.value = pack
  dialogVisible.value = true
}

function onSaved(saved: CoinPackAdmin): void {
  const exists = packs.value.some((pack) => pack.id === saved.id)
  packs.value = sortByPosition(
    exists
      ? packs.value.map((pack) => (pack.id === saved.id ? saved : pack))
      : [...packs.value, saved],
  )
}

function pricesLabel(prices: Price[]): string {
  return prices.map((price) => formatPrice(price, locale.value)).join(' · ')
}

async function toggleActive(pack: CoinPackAdmin, isActive: boolean): Promise<void> {
  busyId.value = pack.id
  try {
    onSaved(await api.updatePack(pack.id, { isActive }))
    notify.success(
      t(isActive ? 'monetization.toasts.activated' : 'monetization.toasts.deactivated'),
    )
  } catch (err) {
    notify.apiError(err, t('monetization.toasts.saveFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(pack: CoinPackAdmin): void {
  confirm.require({
    header: t('monetization.packs.delete'),
    message: t('monetization.packs.deleteConfirm', { sku: pack.sku }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(pack),
  })
}

async function remove(pack: CoinPackAdmin): Promise<void> {
  busyId.value = pack.id
  try {
    await api.deletePack(pack.id)
    packs.value = withPositions(packs.value.filter((item) => item.id !== pack.id))
    notify.success(t('monetization.toasts.packDeleted'))
  } catch (err) {
    notify.apiError(err, t('monetization.toasts.deleteFailed'))
  } finally {
    busyId.value = null
  }
}

async function onRowReorder(event: { value: CoinPackAdmin[] }): Promise<void> {
  const previous = packs.value
  packs.value = withPositions(event.value)
  reordering.value = true
  try {
    packs.value = sortByPosition(await api.reorderPacks(orderIds(event.value)))
    notify.success(t('monetization.toasts.reordered'))
  } catch (err) {
    packs.value = previous
    notify.apiError(err, t('monetization.toasts.saveFailed'))
  } finally {
    reordering.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="packs-panel">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-color">
        {{
          t(
            'monetization.packs.summary',
            { count: packs.length, active: activeCount },
            packs.length,
          )
        }}
      </p>
      <Button
        :label="t('monetization.packs.create')"
        icon="pi pi-plus"
        size="small"
        data-testid="create-pack"
        @click="openCreate"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('monetization.loadError') }}</span>
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
      :value="packs"
      :loading="status === 'pending' && packs.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
      @row-reorder="onRowReorder"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-wallet text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('monetization.packs.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('monetization.packs.empty.hint') }}</p>
        </div>
      </template>

      <Column row-reorder class="w-10" :reorderable-column="false" />
      <Column
        field="position"
        :header="t('monetization.packs.columns.position')"
        class="w-14 text-right"
      >
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <span class="tabular-nums">{{ row.position }}</span>
        </template>
      </Column>
      <Column :header="t('monetization.packs.columns.sku')">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <span class="font-mono text-sm">{{ row.sku }}</span>
          <Tag v-if="row.badge" :value="row.badge" severity="info" class="ml-2" />
        </template>
      </Column>
      <Column :header="t('monetization.packs.columns.coins')" class="w-24 text-right">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <span class="tabular-nums">{{ n(row.coins) }}</span>
        </template>
      </Column>
      <Column :header="t('monetization.packs.columns.bonus')" class="w-24 text-right">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <span class="tabular-nums" :class="row.bonusCoins ? 'text-primary' : 'text-muted-color'"
            >+{{ n(row.bonusCoins) }}</span
          >
        </template>
      </Column>
      <Column :header="t('monetization.packs.columns.total')" class="w-24 text-right">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <span class="font-medium tabular-nums">{{ n(row.coins + row.bonusCoins) }}</span>
        </template>
      </Column>
      <Column :header="t('monetization.packs.columns.prices')">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <span class="text-sm tabular-nums">{{ pricesLabel(row.prices) }}</span>
        </template>
      </Column>
      <Column :header="t('monetization.packs.columns.active')" class="w-24">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="busyId === row.id || reordering"
            :aria-label="t('monetization.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: row }: { data: CoinPackAdmin }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('monetization.packs.edit')"
              :title="t('monetization.packs.edit')"
              @click="openEdit(row)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :loading="busyId === row.id"
              :aria-label="t('monetization.packs.delete')"
              :title="t('monetization.packs.delete')"
              @click="askDelete(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <MonetizationPackDialog v-model:visible="dialogVisible" :pack="editing" @saved="onSaved" />
  </div>
</template>
