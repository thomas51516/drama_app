<script setup lang="ts">
import type { TopupOrder } from '#base/types/api'
import { formatPrice } from '#base/utils/monetization'
import { formatZoned } from '#base/utils/schedule'
import { effectiveStatus, orderId as idOf, orderTotalCoins, sortOrders } from '#base/utils/topup'

/** The user's top-up orders (`GET /topup/orders?page`), newest first, « Charger plus ». */
const { t, n, locale } = useI18n()
const api = useTopupApi()

const page = ref(1)
const items = ref<TopupOrder[]>([])
const total = ref(0)

const { status, error, refresh } = useAsyncData(
  'recharge-orders-page-1',
  async () => {
    const result = await api.listOrders(1)
    items.value = sortOrders(result.items)
    total.value = result.total
    page.value = 1
    return result
  },
  { server: !api.isMock },
)

const loadingMore = ref(false)
const hasMore = computed(() => items.value.length < total.value)

async function loadMore(): Promise<void> {
  loadingMore.value = true
  try {
    const result = await api.listOrders(page.value + 1)
    page.value += 1
    items.value = sortOrders([...items.value, ...result.items])
    total.value = result.total
  } finally {
    loadingMore.value = false
  }
}

useHead({ title: t('recharge.history.pageTitle') })
</script>

<template>
  <div class="flex flex-col gap-5" data-testid="history">
    <div class="flex items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('recharge.history.title') }}</h1>
        <p class="mt-1 text-sm text-muted-color">
          {{ t('recharge.history.subtitle', { count: total }, total) }}
        </p>
      </div>
      <Button
        icon="pi pi-refresh"
        severity="secondary"
        text
        :aria-label="t('common.refresh')"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('recharge.history.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <div
      v-else-if="status === 'pending' && items.length === 0"
      class="flex flex-col gap-2"
      aria-busy="true"
    >
      <div v-for="index in 3" :key="index" class="h-20 animate-pulse rounded-2xl bg-surface-200" />
    </div>

    <div
      v-else-if="items.length === 0"
      class="rounded-2xl border border-dashed border-surface-300 p-8 text-center"
    >
      <i class="pi pi-history text-3xl text-muted-color" aria-hidden="true" />
      <p class="mt-3 font-medium">{{ t('recharge.history.empty') }}</p>
      <NuxtLink to="/packs" class="mt-4 inline-block"
        ><Button :label="t('recharge.nav.packs')" size="small"
      /></NuxtLink>
    </div>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="order in items" :key="idOf(order)">
        <component
          :is="effectiveStatus(order) === 'PENDING' ? 'NuxtLink' : 'div'"
          :to="
            effectiveStatus(order) === 'PENDING'
              ? `/pay/${encodeURIComponent(idOf(order))}`
              : undefined
          "
          class="flex items-center justify-between gap-3 rounded-2xl border border-surface-200 bg-surface-0 p-4"
          :class="effectiveStatus(order) === 'PENDING' ? 'hover:border-primary' : ''"
        >
          <div class="min-w-0">
            <p class="font-medium tabular-nums">
              {{ n(orderTotalCoins(order)) }} {{ t('recharge.coins', orderTotalCoins(order)) }}
              <span class="font-normal text-muted-color">
                · {{ formatPrice(order.amount ?? null, locale) }}</span
              >
            </p>
            <p class="truncate text-xs text-muted-color">
              <span v-if="order.packSku" class="font-mono">{{ order.packSku }} · </span>
              {{ order.createdAt ? formatZoned(order.createdAt, locale) : '' }}
              <span v-if="order.creditedAt"> · {{ t('recharge.history.credited') }}</span>
            </p>
          </div>
          <RechargeOrderStatusTag :status="effectiveStatus(order)" />
        </component>
      </li>
    </ul>

    <Button
      v-if="hasMore"
      :label="t('recharge.history.loadMore')"
      severity="secondary"
      outlined
      :loading="loadingMore"
      @click="loadMore"
    />
  </div>
</template>
