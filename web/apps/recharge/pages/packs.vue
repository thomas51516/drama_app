<script setup lang="ts">
import type { CoinPack, PublicOffers } from '#base/types/api'
import { useRechargePrefs } from '#base/composables/useRechargePrefs'
import { packOfferBadge } from '#base/utils/offers'
import { formatPrice } from '#base/utils/monetization'
import {
  bestValueSku,
  isCurrencyFallback,
  memoFromCreated,
  newIdempotencyKey,
  resolveCountry,
} from '#base/utils/topup'

/** Packs of `GET /shop` for the chosen country, with the offer badges of `GET /offers`. */
const { t, locale } = useI18n()
const api = useTopupApi()
const session = useRechargeSession()
const prefs = useRechargePrefs()
const orders = useTopupOrdersStore()
const notify = useNotify()

// A signed-in user without an explicit choice sees the shop of their account country.
if (!prefs.hasCountry.value && session.user?.country) {
  prefs.country.value = resolveCountry(null, session.user.country)
}
const country = computed(() => prefs.country.value)

const {
  data: shop,
  status,
  error,
  refresh,
} = useAsyncData(
  () => `recharge-shop-${country.value}`,
  () => api.shop(country.value),
  { watch: [country], server: !api.isMock, default: () => null },
)
// Offer badges are a nice-to-have: a failed /offers call falls back to "no offer" rather than
// failing the page (and returns an empty-but-valid shape, not null, per Nuxt's useAsyncData rule).
const noOffers: PublicOffers = { welcome: null, limited: [] }
const { data: offers } = useAsyncData(
  () => `recharge-offers-${session.isAuthenticated ? 'user' : 'anon'}`,
  () => api.offers().catch(() => noOffers),
  { server: !api.isMock, default: () => noOffers },
)

const packs = computed<CoinPack[]>(() => shop.value?.coinPacks ?? [])
const bestValue = computed(() => bestValueSku(packs.value))
const fallback = computed(
  () => shop.value !== null && isCurrencyFallback(country.value, shop.value.currency),
)
const welcome = computed(() => offers.value?.welcome ?? null)

const buying = ref<string | null>(null)

async function buy(pack: CoinPack): Promise<void> {
  if (!session.isAuthenticated) {
    await navigateTo({ path: '/login', query: { redirect: '/packs' } })
    return
  }
  buying.value = pack.sku
  try {
    const created = await api.createOrder({
      packSku: pack.sku,
      country: country.value,
      idempotencyKey: newIdempotencyKey(),
    })
    orders.remember(
      memoFromCreated(created, {
        packSku: pack.sku,
        country: country.value,
        coins: pack.coins + pack.bonusCoins,
      }),
    )
    await navigateTo(`/pay/${encodeURIComponent(created.orderId)}`)
  } catch (err) {
    notify.apiError(err, t('recharge.packs.orderFailed'))
  } finally {
    buying.value = null
  }
}

useHead({ title: t('recharge.packs.pageTitle') })
</script>

<template>
  <div class="flex flex-col gap-5" data-testid="packs">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold">{{ t('recharge.packs.title') }}</h1>
        <p class="mt-1 text-sm text-muted-color">{{ t('recharge.packs.subtitle') }}</p>
      </div>
      <div class="flex flex-col gap-1 sm:w-64">
        <label for="packs-country" class="text-xs font-medium text-muted-color">{{
          t('recharge.country')
        }}</label>
        <RechargeCountrySelect v-model="prefs.country.value" input-id="packs-country" />
      </div>
    </div>

    <Message
      v-if="welcome"
      severity="success"
      :closable="false"
      icon="pi pi-gift"
      data-testid="welcome-banner"
    >
      {{ t('recharge.packs.welcomeBanner', { percent: welcome.bonusPercent }) }}
    </Message>
    <Message v-if="fallback && shop" severity="warn" :closable="false" size="small">
      {{ t('recharge.packs.fallbackCurrency', { currency: shop.currency }) }}
    </Message>
    <Message v-if="!session.isAuthenticated" severity="info" :closable="false" size="small">
      {{ t('recharge.packs.signInToBuy') }}
      <NuxtLink to="/login?redirect=/packs" class="font-medium underline">{{
        t('recharge.nav.signIn')
      }}</NuxtLink>
    </Message>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('recharge.packs.loadError') }}</span>
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
      v-else-if="status === 'pending' && packs.length === 0"
      class="grid gap-3 sm:grid-cols-2"
      aria-busy="true"
    >
      <div v-for="index in 4" :key="index" class="h-40 animate-pulse rounded-2xl bg-surface-200" />
    </div>

    <p
      v-else-if="packs.length === 0"
      class="rounded-2xl border border-dashed border-surface-300 p-8 text-center text-sm text-muted-color"
    >
      {{ t('recharge.packs.empty') }}
    </p>

    <div v-else class="grid gap-3 sm:grid-cols-2">
      <RechargePackCard
        v-for="pack in packs"
        :key="pack.id"
        :pack="pack"
        :offer="packOfferBadge(pack, offers)"
        :best-value="pack.sku === bestValue"
        :busy="buying === pack.sku"
        :disabled="buying !== null && buying !== pack.sku"
        @buy="buy"
      />
    </div>

    <p v-if="shop" class="text-xs text-muted-color">
      {{
        t('recharge.packs.priceNote', {
          currency: shop.currency,
          example: formatPrice(packs[0]?.price ?? null, locale),
        })
      }}
    </p>
  </div>
</template>
