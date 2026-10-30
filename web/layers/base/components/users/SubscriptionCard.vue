<script setup lang="ts">
import type { UserSubscription } from '../../types/api'
import { isVipPeriod } from '../../utils/monetization'

/** Subscription card (B-09): status, plan, dates, auto-renew and store. */
defineProps<{ subscription: UserSubscription | null }>()
const { t, d } = useI18n()

function formatDate(iso: string | null): string {
  return iso ? d(new Date(iso), 'long') : '—'
}

function planLabel(plan: string | null): string {
  if (!plan) return '—'
  return isVipPeriod(plan) ? t(`monetization.period.${plan}`) : plan
}

function severity(status: UserSubscription['status']): 'success' | 'warn' | 'danger' | 'secondary' {
  switch (status) {
    case 'active':
      return 'success'
    case 'cancelled':
    case 'grace':
      return 'warn'
    case 'expired':
      return 'danger'
    default:
      return 'secondary'
  }
}
</script>

<template>
  <section
    class="rounded-lg border border-surface-200 bg-surface-0 p-5"
    data-testid="user-subscription"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">{{ t('users.detail.subscription') }}</h2>
      <Tag
        v-if="subscription && subscription.status !== 'none'"
        :value="t(`users.detail.subscriptionStatus.${subscription.status}`)"
        :severity="severity(subscription.status)"
      />
    </div>
    <p v-if="!subscription || subscription.status === 'none'" class="mt-3 text-sm text-muted-color">
      {{ t('users.detail.noSubscription') }}
    </p>
    <dl v-else class="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.plan') }}</dt>
        <dd class="font-medium">{{ planLabel(subscription.plan) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.store') }}</dt>
        <dd class="font-medium">
          {{ subscription.store === 'google' ? 'Google Play' : (subscription.store ?? '—') }}
        </dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.startedAt') }}</dt>
        <dd class="font-medium tabular-nums">{{ formatDate(subscription.startedAt) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.expiresAt') }}</dt>
        <dd class="font-medium tabular-nums">{{ formatDate(subscription.expiresAt) }}</dd>
      </div>
      <div>
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.autoRenew') }}</dt>
        <dd class="font-medium">{{ subscription.autoRenew ? t('common.yes') : t('common.no') }}</dd>
      </div>
    </dl>
  </section>
</template>
