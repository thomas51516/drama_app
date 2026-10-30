<script setup lang="ts">
import type { TopupOrder, TopupOrderStatus, Wallet } from '#base/types/api'
import { createPoller } from '#base/utils/polling'
import { formatPrice } from '#base/utils/monetization'
import { formatZoned } from '#base/utils/schedule'
import {
  PAY_POLL_INTERVAL_MS,
  canRetry,
  effectiveStatus,
  isExternalPaymentUrl,
  isTerminalStatus,
  memoFromCreated,
  newIdempotencyKey,
  orderTotalCoins,
  payStep,
  type PayStep,
} from '#base/utils/topup'

/**
 * Payment page of an order: summary + « Payer » (redirect to the provider's `paymentUrl`), then
 * on return it polls `GET /topup/orders/{id}` every 3 s until PAID / FAILED / EXPIRED.
 */
const { t, n, locale } = useI18n()
const route = useRoute()
const api = useTopupApi()
const orders = useTopupOrdersStore()
const notify = useNotify()

const orderId = computed(() => String(route.params.orderId ?? ''))
const memo = computed(() => orders.get(orderId.value))
const returned = ref(route.query.returned === '1')

const {
  data: order,
  status: loadStatus,
  error,
  refresh,
} = useAsyncData(
  () => `recharge-order-${orderId.value}`,
  () => api.getOrder(orderId.value),
  { server: !api.isMock, default: () => null },
)

const attempts = ref(0)
const currentStatus = computed<TopupOrderStatus>(() =>
  order.value ? effectiveStatus(order.value) : 'PENDING',
)
const step = computed(() =>
  payStep(currentStatus.value, {
    returned: returned.value || Boolean(memo.value?.leftAt),
    attempts: attempts.value,
  }),
)
const paymentUrl = computed(() => order.value?.paymentUrl ?? memo.value?.paymentUrl ?? null)
const amount = computed(() => order.value?.amount ?? memo.value?.amount ?? null)
const coins = computed(() =>
  order.value ? orderTotalCoins(order.value) : (memo.value?.coins ?? 0),
)
const expiresAt = computed(() => order.value?.expiresAt ?? memo.value?.expiresAt ?? null)

// --- polling after the provider -------------------------------------------------------------
const wallet = ref<Wallet | null>(null)
const poller = createPoller({
  intervalMs: PAY_POLL_INTERVAL_MS,
  task: async () => {
    attempts.value += 1
    await refresh()
    const status = order.value ? effectiveStatus(order.value) : 'PENDING'
    return !isTerminalStatus(status) && step.value === 'waiting'
  },
})

watch(
  step,
  async (value: PayStep) => {
    if (value === 'waiting') poller.start()
    else poller.stop()
    if (value === 'paid' && !wallet.value) {
      try {
        wallet.value = await api.wallet()
      } catch {
        wallet.value = null
      }
      orders.forget(orderId.value)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => poller.stop())

// --- actions --------------------------------------------------------------------------------
const redirecting = ref(false)
async function pay(): Promise<void> {
  if (!paymentUrl.value) {
    notify.error(t('recharge.pay.noPaymentUrl'))
    return
  }
  redirecting.value = true
  orders.markLeft(orderId.value)
  if (isExternalPaymentUrl(paymentUrl.value)) {
    window.location.assign(paymentUrl.value)
  } else {
    await navigateTo(paymentUrl.value)
  }
}

function checkNow(): void {
  attempts.value = 0
  returned.value = true
  void poller.runNow()
}

const retrying = ref(false)
async function retry(): Promise<void> {
  const packSku = order.value?.packSku ?? memo.value?.packSku
  const country = memo.value?.country ?? useRechargeSession().user?.country ?? 'TG'
  if (!packSku) {
    await navigateTo('/packs')
    return
  }
  retrying.value = true
  try {
    const created = await api.createOrder({ packSku, country, idempotencyKey: newIdempotencyKey() })
    orders.remember(memoFromCreated(created, { packSku, country, coins: coins.value }))
    await navigateTo(`/pay/${encodeURIComponent(created.orderId)}`, { replace: true })
  } catch (err) {
    notify.apiError(err, t('recharge.packs.orderFailed'))
  } finally {
    retrying.value = false
  }
}

function describe(value: TopupOrder | null): string {
  return value?.packSku ?? memo.value?.packSku ?? orderId.value
}

useHead({ title: t('recharge.pay.pageTitle') })
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-5" data-testid="pay" :data-step="step">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('recharge.pay.title') }}</h1>
      <p class="mt-1 text-sm text-muted-color">{{ t('recharge.pay.order', { id: orderId }) }}</p>
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('recharge.pay.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
        <NuxtLink to="/history"
          ><Button :label="t('recharge.nav.history')" size="small" severity="secondary" text
        /></NuxtLink>
      </div>
    </Message>

    <template v-else>
      <!-- Summary -->
      <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase text-muted-color">{{ t('recharge.pay.pack') }}</p>
            <p class="font-mono text-sm">{{ describe(order) }}</p>
          </div>
          <RechargeOrderStatusTag :status="currentStatus" />
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p class="text-xs uppercase text-muted-color">{{ t('recharge.pay.coins') }}</p>
            <p class="text-2xl font-semibold tabular-nums">{{ n(coins) }}</p>
          </div>
          <div>
            <p class="text-xs uppercase text-muted-color">{{ t('recharge.pay.amount') }}</p>
            <p class="text-2xl font-semibold tabular-nums" data-testid="pay-amount">
              {{ formatPrice(amount, locale) }}
            </p>
          </div>
        </div>
        <p v-if="expiresAt && currentStatus === 'PENDING'" class="mt-3 text-xs text-muted-color">
          {{ t('recharge.pay.expires', { date: formatZoned(expiresAt, locale) }) }}
        </p>
      </section>

      <!-- Ready: go to the provider -->
      <section v-if="step === 'ready'" class="flex flex-col gap-3">
        <Button
          :label="t('recharge.pay.payNow')"
          icon="pi pi-mobile"
          size="large"
          :loading="redirecting || loadStatus === 'pending'"
          :disabled="!paymentUrl"
          fluid
          data-testid="pay-now"
          @click="pay"
        />
        <p class="text-center text-xs text-muted-color">{{ t('recharge.pay.providerHint') }}</p>
        <Button
          :label="t('recharge.pay.alreadyPaid')"
          severity="secondary"
          text
          size="small"
          @click="checkNow"
        />
      </section>

      <!-- Waiting for the webhook -->
      <section
        v-else-if="step === 'waiting'"
        class="flex flex-col items-center gap-3 rounded-2xl border border-surface-200 bg-surface-0 p-6 text-center"
        aria-live="polite"
      >
        <ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="6" />
        <p class="font-medium">{{ t('recharge.pay.waiting') }}</p>
        <p class="text-sm text-muted-color">{{ t('recharge.pay.waitingHint') }}</p>
        <Button
          v-if="paymentUrl"
          :label="t('recharge.pay.backToProvider')"
          severity="secondary"
          text
          size="small"
          @click="pay"
        />
      </section>

      <!-- Still pending after two minutes -->
      <section
        v-else-if="step === 'timeout'"
        class="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5"
      >
        <p class="font-medium">{{ t('recharge.pay.timeout') }}</p>
        <p class="text-sm text-muted-color">{{ t('recharge.pay.timeoutHint') }}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button
            :label="t('recharge.pay.checkAgain')"
            icon="pi pi-refresh"
            fluid
            @click="checkNow"
          />
          <NuxtLink to="/history" class="flex-1"
            ><Button :label="t('recharge.nav.history')" severity="secondary" outlined fluid
          /></NuxtLink>
        </div>
      </section>

      <!-- Paid -->
      <section
        v-else-if="step === 'paid'"
        class="flex flex-col gap-3 rounded-2xl border border-green-300 bg-green-50 p-5"
        data-testid="paid"
      >
        <div class="flex items-center gap-3">
          <i class="pi pi-check-circle text-3xl text-green-700" aria-hidden="true" />
          <div>
            <p class="text-lg font-semibold">{{ t('recharge.pay.paidTitle') }}</p>
            <p class="text-sm">
              {{ t('recharge.pay.paidText', { coins: n(coins) }) }}
            </p>
          </div>
        </div>
        <p v-if="wallet" class="text-sm" data-testid="paid-balance">
          {{ t('recharge.pay.balance', { total: n(wallet.total) }) }}
        </p>
        <p v-if="order?.creditedAt" class="text-xs text-muted-color">
          {{ t('recharge.pay.creditedAt', { date: formatZoned(order.creditedAt, locale) }) }}
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <NuxtLink to="/account" class="flex-1"
            ><Button :label="t('recharge.nav.account')" icon="pi pi-user" fluid
          /></NuxtLink>
          <NuxtLink to="/packs" class="flex-1"
            ><Button :label="t('recharge.pay.again')" severity="secondary" outlined fluid
          /></NuxtLink>
        </div>
      </section>

      <!-- Failed / expired -->
      <section
        v-else
        class="flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-5"
        data-testid="failed"
      >
        <div class="flex items-center gap-3">
          <i class="pi pi-times-circle text-3xl text-red-700" aria-hidden="true" />
          <div>
            <p class="text-lg font-semibold">
              {{
                step === 'expired' ? t('recharge.pay.expiredTitle') : t('recharge.pay.failedTitle')
              }}
            </p>
            <p class="text-sm">
              {{
                step === 'expired' ? t('recharge.pay.expiredText') : t('recharge.pay.failedText')
              }}
            </p>
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button
            v-if="canRetry(step)"
            :label="t('recharge.pay.retry')"
            icon="pi pi-replay"
            :loading="retrying"
            fluid
            data-testid="retry"
            @click="retry"
          />
          <NuxtLink to="/packs" class="flex-1"
            ><Button :label="t('recharge.nav.packs')" severity="secondary" outlined fluid
          /></NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
