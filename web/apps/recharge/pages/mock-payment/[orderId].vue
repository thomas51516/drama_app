<script setup lang="ts">
import { formatPrice } from '#base/utils/monetization'

/**
 * Mock mode only: stand-in for the provider's payment page (in real mode the API serves it at
 * `paymentUrl`). « Payer » / « Échouer » settle the order through the mock-only endpoint, then
 * the user is sent back to the pay page exactly like a provider redirect would.
 */
const { t, locale } = useI18n()
const route = useRoute()
const api = useTopupApi()
const orders = useTopupOrdersStore()
const notify = useNotify()

const orderId = computed(() => String(route.params.orderId ?? ''))
const memo = computed(() => orders.get(orderId.value))
const { data: order } = useAsyncData(
  () => `mock-payment-${orderId.value}`,
  () => api.getOrder(orderId.value),
  {
    server: false,
    default: () => null,
  },
)
const amount = computed(() => order.value?.amount ?? memo.value?.amount ?? null)

const busy = ref<'paid' | 'failed' | null>(null)
async function settle(outcome: 'paid' | 'failed'): Promise<void> {
  busy.value = outcome
  try {
    await api.mockPay(orderId.value, outcome)
    await navigateTo(
      { path: `/pay/${encodeURIComponent(orderId.value)}`, query: { returned: '1' } },
      { replace: true },
    )
  } catch (err) {
    notify.apiError(err, t('recharge.mockPayment.failed'))
  } finally {
    busy.value = null
  }
}

useHead({ title: t('recharge.mockPayment.title') })
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-5" data-testid="mock-payment">
    <Message v-if="!api.isMock" severity="error" :closable="false">{{
      t('recharge.mockPayment.notMock')
    }}</Message>
    <template v-else>
      <div class="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-5">
        <p class="text-xs font-semibold uppercase tracking-wider text-amber-700">
          {{ t('recharge.mockPayment.badge') }}
        </p>
        <h1 class="mt-1 text-2xl font-semibold">{{ t('recharge.mockPayment.title') }}</h1>
        <p class="mt-1 text-sm text-muted-color">{{ t('recharge.mockPayment.hint') }}</p>
        <p class="mt-4 text-3xl font-semibold tabular-nums" data-testid="mock-amount">
          {{ formatPrice(amount, locale) }}
        </p>
        <p class="font-mono text-xs text-muted-color">{{ orderId }}</p>
        <div class="mt-5 flex flex-col gap-2">
          <Button
            :label="t('recharge.mockPayment.pay')"
            icon="pi pi-check"
            severity="success"
            :loading="busy === 'paid'"
            :disabled="busy !== null"
            fluid
            data-testid="mock-pay"
            @click="settle('paid')"
          />
          <Button
            :label="t('recharge.mockPayment.fail')"
            icon="pi pi-times"
            severity="danger"
            outlined
            :loading="busy === 'failed'"
            :disabled="busy !== null"
            fluid
            data-testid="mock-fail"
            @click="settle('failed')"
          />
        </div>
      </div>
      <NuxtLink
        :to="`/pay/${encodeURIComponent(orderId)}`"
        class="text-center text-sm text-primary underline"
        >{{ t('recharge.mockPayment.back') }}</NuxtLink
      >
    </template>
  </div>
</template>
