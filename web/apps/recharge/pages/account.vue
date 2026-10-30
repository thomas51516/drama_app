<script setup lang="ts">
import { useRechargePrefs } from '#base/composables/useRechargePrefs'
import { countryName } from '#base/utils/countries'
import { formatZoned } from '#base/utils/schedule'

/** Account: who is signed in, the coin balance (`GET /wallet`), preferences and sign-out. */
const { t, n, locale } = useI18n()
const api = useTopupApi()
const session = useRechargeSession()
const prefs = useRechargePrefs()

const {
  data: wallet,
  status,
  error,
  refresh,
} = useAsyncData('recharge-wallet', () => api.wallet(), {
  server: !api.isMock,
  default: () => null,
})

const identity = computed(() => {
  const user = session.user
  if (!user) return ''
  return user.displayName || user.email || user.phone || user.id
})
const providers = computed(() => session.user?.providers ?? [])
const expiringSoon = computed(() => wallet.value?.bonusExpiring.slice(0, 3) ?? [])

const loggingOut = ref(false)
async function logout(): Promise<void> {
  loggingOut.value = true
  try {
    await session.logout()
  } finally {
    loggingOut.value = false
  }
  await navigateTo('/', { replace: true })
}

useHead({ title: t('recharge.account.pageTitle') })
</script>

<template>
  <div class="flex flex-col gap-5" data-testid="account">
    <div>
      <h1 class="text-2xl font-semibold">{{ t('recharge.account.title') }}</h1>
      <p class="mt-1 text-sm text-muted-color">{{ t('recharge.account.subtitle') }}</p>
    </div>

    <!-- Balance -->
    <section class="rounded-3xl bg-surface-900 p-5 text-surface-0" aria-labelledby="balance-title">
      <div class="flex items-center justify-between">
        <h2
          id="balance-title"
          class="text-xs font-semibold uppercase tracking-wider text-surface-300"
        >
          {{ t('recharge.account.balance') }}
        </h2>
        <Button
          icon="pi pi-refresh"
          text
          rounded
          severity="secondary"
          class="!text-surface-0"
          :aria-label="t('common.refresh')"
          :loading="status === 'pending'"
          @click="refresh()"
        />
      </div>
      <Message v-if="error" severity="error" :closable="false" size="small" class="mt-3">{{
        t('recharge.account.walletError')
      }}</Message>
      <template v-else>
        <p class="mt-2 text-4xl font-semibold tabular-nums" data-testid="balance-total">
          {{ wallet ? n(wallet.total) : '—' }}
          <span class="text-lg font-normal text-surface-300">{{
            t('recharge.coins', wallet?.total ?? 0)
          }}</span>
        </p>
        <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt class="text-surface-400">{{ t('recharge.account.purchased') }}</dt>
            <dd class="font-medium tabular-nums">{{ wallet ? n(wallet.purchased) : '—' }}</dd>
          </div>
          <div>
            <dt class="text-surface-400">{{ t('recharge.account.bonus') }}</dt>
            <dd class="font-medium tabular-nums">{{ wallet ? n(wallet.bonus) : '—' }}</dd>
          </div>
        </dl>
        <ul v-if="expiringSoon.length > 0" class="mt-3 space-y-0.5 text-xs text-surface-300">
          <li v-for="lot in expiringSoon" :key="lot.expiresAt">
            {{
              t('recharge.account.expiring', {
                amount: n(lot.amount),
                date: formatZoned(lot.expiresAt, locale, undefined, 'date'),
              })
            }}
          </li>
        </ul>
        <p v-if="wallet && wallet.total < 0" class="mt-3 text-xs text-amber-300">
          {{ t('recharge.account.negative') }}
        </p>
      </template>
      <NuxtLink to="/packs" class="mt-4 block">
        <Button :label="t('recharge.account.topUp')" icon="pi pi-plus" fluid />
      </NuxtLink>
    </section>

    <!-- Profile -->
    <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="text-sm font-semibold uppercase text-muted-color">
        {{ t('recharge.account.profile') }}
      </h2>
      <p class="mt-2 text-lg font-medium" data-testid="account-identity">{{ identity }}</p>
      <dl class="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div v-if="session.user?.email">
          <dt class="text-muted-color">{{ t('recharge.login.email') }}</dt>
          <dd>{{ session.user.email }}</dd>
        </div>
        <div v-if="session.user?.phone">
          <dt class="text-muted-color">{{ t('recharge.login.phone') }}</dt>
          <dd>{{ session.user.phone }}</dd>
        </div>
        <div>
          <dt class="text-muted-color">{{ t('recharge.account.providers') }}</dt>
          <dd>
            {{
              providers.length
                ? providers.map((p: string) => t(`users.providers.${p}`)).join(', ')
                : t('users.providers.none')
            }}
          </dd>
        </div>
        <div v-if="session.user?.country">
          <dt class="text-muted-color">{{ t('recharge.account.accountCountry') }}</dt>
          <dd>{{ countryName(session.user.country, locale) }}</dd>
        </div>
        <div v-if="session.user?.vipStatus === 'active'">
          <dt class="text-muted-color">VIP</dt>
          <dd>{{ t('users.vip.active') }}</dd>
        </div>
      </dl>
    </section>

    <!-- Preferences -->
    <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="text-sm font-semibold uppercase text-muted-color">
        {{ t('recharge.account.preferences') }}
      </h2>
      <div class="mt-3 flex flex-col gap-1">
        <label for="account-country" class="text-sm font-medium">{{ t('recharge.country') }}</label>
        <RechargeCountrySelect v-model="prefs.country.value" input-id="account-country" />
        <small class="text-xs text-muted-color">{{ t('recharge.account.countryHint') }}</small>
      </div>
    </section>

    <div class="flex flex-col gap-2 sm:flex-row">
      <NuxtLink to="/history" class="flex-1"
        ><Button
          :label="t('recharge.nav.history')"
          icon="pi pi-history"
          severity="secondary"
          outlined
          fluid
      /></NuxtLink>
      <Button
        :label="t('recharge.account.logout')"
        icon="pi pi-sign-out"
        severity="danger"
        outlined
        :loading="loggingOut"
        class="flex-1"
        data-testid="logout"
        @click="logout"
      />
    </div>
  </div>
</template>
