<script setup lang="ts">
import { computed } from 'vue'
import type { CoinPack } from '../../types/api'
import type { PackBadge } from '../../utils/offers'
import { bonusFromPercent } from '../../utils/offers'
import { formatZoned } from '../../utils/schedule'
import { packBonusPercent, packPriceLabel } from '../../utils/topup'

/** One coin pack of the shop: coins, bonus, local price, offer badge and the buy button. */
const props = defineProps<{
  pack: CoinPack
  offer: PackBadge | null
  bestValue?: boolean
  busy?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ buy: [pack: CoinPack] }>()
const { t, n, locale } = useI18n()

const bonusPercent = computed(() => packBonusPercent(props.pack))
const offerBonus = computed(() =>
  props.offer ? bonusFromPercent(props.pack.coins, props.offer.bonusPercent) : 0,
)
const total = computed(() => props.pack.coins + props.pack.bonusCoins + offerBonus.value)
</script>

<template>
  <article
    class="relative flex flex-col gap-3 rounded-2xl border bg-surface-0 p-4 shadow-sm"
    :class="offer ? 'border-primary' : 'border-surface-200'"
    :data-testid="`pack-${pack.sku}`"
  >
    <div class="flex flex-wrap items-center gap-2">
      <Tag
        v-if="offer"
        :value="
          offer.kind === 'welcome'
            ? t('recharge.packs.welcomeBadge', { percent: offer.bonusPercent })
            : t('recharge.packs.limitedBadge', { percent: offer.bonusPercent })
        "
        severity="success"
        icon="pi pi-gift"
      />
      <Tag v-else-if="pack.badge" :value="pack.badge" severity="info" />
      <Tag v-if="bestValue" :value="t('recharge.packs.bestValue')" severity="warn" />
    </div>

    <div class="flex items-end justify-between gap-3">
      <div>
        <p class="text-3xl font-semibold tabular-nums">
          {{ n(pack.coins) }}
          <span class="text-base font-normal text-muted-color">{{
            t('recharge.coins', pack.coins)
          }}</span>
        </p>
        <p v-if="pack.bonusCoins > 0 || offerBonus > 0" class="text-sm text-primary">
          +{{ n(pack.bonusCoins + offerBonus) }} {{ t('recharge.packs.bonus') }}
          <span v-if="bonusPercent && !offer" class="text-muted-color"
            >(+{{ bonusPercent }} %)</span
          >
          <span class="text-muted-color">
            · {{ t('recharge.packs.total', { total: n(total) }) }}</span
          >
        </p>
      </div>
      <p class="text-xl font-semibold tabular-nums" data-testid="pack-price">
        {{ packPriceLabel(pack, locale) }}
      </p>
    </div>

    <p v-if="offer" class="text-xs text-muted-color">
      {{
        offer.kind === 'welcome'
          ? t('recharge.packs.welcomeUntil', { date: formatZoned(offer.endsAt, locale) })
          : t('recharge.packs.limitedUntil', {
              title: offer.title,
              date: formatZoned(offer.endsAt, locale),
            })
      }}
    </p>

    <Button
      :label="t('recharge.packs.buy')"
      icon="pi pi-mobile"
      :loading="busy"
      :disabled="disabled"
      fluid
      :data-testid="`buy-${pack.sku}`"
      @click="emit('buy', pack)"
    />
  </article>
</template>
