<script setup lang="ts">
import type { Wallet } from '../../types/api'

/** Wallet card (B-09): purchased / bonus / total, auto-unlock, expiring bonus. */
defineProps<{ wallet: Wallet }>()
const { t, n, d } = useI18n()
</script>

<template>
  <section class="rounded-lg border border-surface-200 bg-surface-0 p-5" data-testid="user-wallet">
    <h2 class="text-lg font-semibold">{{ t('users.detail.wallet') }}</h2>
    <dl class="mt-3 grid grid-cols-3 gap-3 text-center">
      <div class="rounded-md bg-surface-100 p-3">
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.purchased') }}</dt>
        <dd class="text-xl font-semibold tabular-nums" data-testid="wallet-purchased">
          {{ n(wallet.purchased) }}
        </dd>
      </div>
      <div class="rounded-md bg-surface-100 p-3">
        <dt class="text-xs uppercase text-muted-color">{{ t('users.detail.bonus') }}</dt>
        <dd class="text-xl font-semibold tabular-nums" data-testid="wallet-bonus">
          {{ n(wallet.bonus) }}
        </dd>
      </div>
      <div class="rounded-md bg-primary-50 p-3">
        <dt class="text-xs uppercase text-primary">{{ t('users.detail.total') }}</dt>
        <dd class="text-xl font-semibold tabular-nums text-primary" data-testid="wallet-total">
          {{ n(wallet.total) }}
        </dd>
      </div>
    </dl>
    <div class="mt-3 flex items-center justify-between text-sm">
      <span class="text-muted-color">{{ t('users.detail.autoUnlock') }}</span>
      <Tag
        :value="wallet.autoUnlock ? t('common.yes') : t('common.no')"
        :severity="wallet.autoUnlock ? 'success' : 'secondary'"
      />
    </div>
    <Message v-if="wallet.total < 0" severity="warn" :closable="false" size="small" class="mt-3">
      {{ t('users.detail.negativeBalance') }}
    </Message>
    <ul
      v-if="wallet.bonusExpiring.length > 0"
      class="mt-3 flex flex-col gap-1 text-xs text-muted-color"
    >
      <li v-for="item in wallet.bonusExpiring" :key="item.expiresAt">
        <i class="pi pi-clock mr-1" aria-hidden="true" />
        {{
          t('users.detail.bonusExpiring', {
            amount: n(item.amount),
            date: d(new Date(item.expiresAt), 'short'),
          })
        }}
      </li>
    </ul>
  </section>
</template>
