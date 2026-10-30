<script setup lang="ts">
import { useRechargePrefs } from '#base/composables/useRechargePrefs'
import { currencyForCountry } from '#base/utils/monetization'
import { operatorsFor } from '#base/utils/topup'

/** Landing: how it works, country selector (persisted in a cookie) and the sign-in CTA. */
const { t } = useI18n()
const prefs = useRechargePrefs()
const session = useRechargeSession()

const steps = computed(() => [
  {
    icon: 'pi pi-user',
    title: t('recharge.home.steps.signIn.title'),
    text: t('recharge.home.steps.signIn.text'),
  },
  {
    icon: 'pi pi-wallet',
    title: t('recharge.home.steps.pick.title'),
    text: t('recharge.home.steps.pick.text'),
  },
  {
    icon: 'pi pi-mobile',
    title: t('recharge.home.steps.pay.title'),
    text: t('recharge.home.steps.pay.text'),
  },
  {
    icon: 'pi pi-check-circle',
    title: t('recharge.home.steps.credited.title'),
    text: t('recharge.home.steps.credited.text'),
  },
])
const operators = computed(() => operatorsFor(prefs.country.value))
const currency = computed(() => currencyForCountry(prefs.country.value))

useHead({ title: t('recharge.home.pageTitle') })
</script>

<template>
  <div class="flex flex-col gap-8" data-testid="landing">
    <section class="rounded-3xl bg-surface-900 px-5 py-8 text-surface-0 sm:px-8">
      <p class="text-xs font-semibold uppercase tracking-wider text-primary-300">
        {{ t('recharge.brand') }}
      </p>
      <h1 class="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
        {{ t('recharge.home.title') }}
      </h1>
      <p class="mt-3 max-w-prose text-surface-300">{{ t('recharge.home.subtitle') }}</p>

      <div class="mt-6 flex flex-col gap-3">
        <label for="home-country" class="text-sm font-medium text-surface-200">{{
          t('recharge.country')
        }}</label>
        <RechargeCountrySelect v-model="prefs.country.value" input-id="home-country" />
        <p class="text-xs text-surface-400">
          {{ t('recharge.home.operators', { currency, operators: operators.join(', ') || '—' }) }}
        </p>
      </div>

      <div class="mt-6 flex flex-col gap-2 sm:flex-row">
        <NuxtLink v-if="!session.isAuthenticated" to="/login?redirect=/packs" class="flex-1">
          <Button
            :label="t('recharge.home.ctaSignIn')"
            icon="pi pi-sign-in"
            fluid
            data-testid="cta-sign-in"
          />
        </NuxtLink>
        <NuxtLink to="/packs" class="flex-1">
          <Button
            :label="t('recharge.home.ctaPacks')"
            icon="pi pi-wallet"
            :severity="session.isAuthenticated ? 'primary' : 'secondary'"
            :outlined="!session.isAuthenticated"
            class="!border-surface-500 !text-surface-0"
            fluid
            data-testid="cta-packs"
          />
        </NuxtLink>
      </div>
    </section>

    <section aria-labelledby="how-title">
      <h2 id="how-title" class="text-xl font-semibold">{{ t('recharge.home.howTitle') }}</h2>
      <ol class="mt-4 grid gap-3 sm:grid-cols-2">
        <li
          v-for="(step, index) in steps"
          :key="index"
          class="flex gap-3 rounded-2xl border border-surface-200 bg-surface-0 p-4"
        >
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary"
            aria-hidden="true"
          >
            <i :class="step.icon" />
          </span>
          <div>
            <p class="font-medium">{{ index + 1 }}. {{ step.title }}</p>
            <p class="mt-0.5 text-sm text-muted-color">{{ step.text }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section
      class="rounded-2xl border border-surface-200 bg-surface-0 p-4 text-sm text-muted-color"
    >
      <p class="font-medium text-surface-900">{{ t('recharge.home.sameAccountTitle') }}</p>
      <p class="mt-1">{{ t('recharge.home.sameAccountText') }}</p>
    </section>
  </div>
</template>
