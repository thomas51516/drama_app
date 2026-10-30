<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CoinPackAdmin } from '../../types/api'
import { useMonetizationApi } from '../../composables/useMonetizationApi'
import { countryName, countryOptions } from '../../utils/countries'
import { sortByPosition } from '../../utils/featured'
import {
  COUNTRY_CURRENCY,
  currencyForCountry,
  formatPrice,
  simulateShopDisplay,
} from '../../utils/monetization'

/**
 * Simulator (B-06): for a country and a pack, what the app displays — currency of the country
 * (USD fallback), price and coins + bonus — plus the whole shop of that country in a phone frame.
 */
const { t, n, locale } = useI18n()
const api = useMonetizationApi()

const { data, status, error, refresh } = useAsyncData('admin-monetization-simulator-packs', () =>
  api.listPacks(),
)
const packs = computed(() => sortByPosition(data.value ?? []))

const country = ref('TG')
const packId = ref<string | null>(null)
watch(
  packs,
  (list) => {
    if (!packId.value || !list.some((pack) => pack.id === packId.value)) {
      packId.value = list.find((pack) => pack.isActive)?.id ?? list[0]?.id ?? null
    }
  },
  { immediate: true },
)

const options = computed(() => {
  // Countries with a dedicated currency first, then the rest of the world (USD).
  const all = countryOptions(locale.value)
  const dedicated = all.filter((option) => option.code in COUNTRY_CURRENCY)
  const others = all.filter((option) => !(option.code in COUNTRY_CURRENCY))
  return [...dedicated, ...others].map((option) => ({
    ...option,
    label: `${option.label} — ${currencyForCountry(option.code)}`,
  }))
})

const pack = computed(() => packs.value.find((item) => item.id === packId.value) ?? null)
const display = computed(() => (pack.value ? simulateShopDisplay(pack.value, country.value) : null))
const shop = computed(() =>
  packs.value
    .filter((item) => item.isActive)
    .map((item) => ({ pack: item, display: simulateShopDisplay(item, country.value) }))
    .filter((item) => item.display.price !== null),
)

function price(item: CoinPackAdmin): string {
  return formatPrice(simulateShopDisplay(item, country.value).price, locale.value)
}
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="shop-simulator">
    <div>
      <h2 class="text-lg font-semibold">{{ t('monetization.simulator.title') }}</h2>
      <p class="mt-1 text-sm text-muted-color">{{ t('monetization.simulator.hint') }}</p>
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

    <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div class="flex flex-col gap-4 rounded-lg border border-surface-200 bg-surface-0 p-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1">
            <label for="sim-country" class="text-sm font-medium">{{
              t('monetization.simulator.country')
            }}</label>
            <Select
              v-model="country"
              input-id="sim-country"
              :options="options"
              option-label="label"
              option-value="code"
              filter
              fluid
            />
          </div>
          <div class="flex flex-col gap-1">
            <label for="sim-pack" class="text-sm font-medium">{{
              t('monetization.simulator.pack')
            }}</label>
            <Select
              v-model="packId"
              input-id="sim-pack"
              :options="packs"
              option-label="sku"
              option-value="id"
              :loading="status === 'pending'"
              :placeholder="t('monetization.simulator.noPacks')"
              fluid
            />
          </div>
        </div>

        <div v-if="pack && display" class="rounded-md bg-surface-100 p-4" data-testid="sim-result">
          <h3 class="text-sm font-semibold uppercase text-muted-color">
            {{ t('monetization.simulator.result') }}
          </h3>
          <dl class="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-3">
            <div>
              <dt class="text-xs text-muted-color">{{ t('monetization.simulator.currency') }}</dt>
              <dd class="text-lg font-semibold">{{ display.currency }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted-color">{{ t('monetization.simulator.price') }}</dt>
              <dd class="text-lg font-semibold tabular-nums" data-testid="sim-price">
                {{ formatPrice(display.price, locale) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted-color">{{ t('monetization.simulator.coins') }}</dt>
              <dd class="text-lg font-semibold tabular-nums">
                {{ n(display.totalCoins) }}
                <span class="text-sm font-normal text-muted-color">
                  ({{
                    t('monetization.simulator.coinsDetail', {
                      coins: n(display.coins),
                      bonus: n(display.bonusCoins),
                    })
                  }})
                </span>
              </dd>
            </div>
          </dl>
          <p
            v-if="display.minorPerCoin !== null && display.price"
            class="mt-3 text-xs text-muted-color"
          >
            {{
              t('monetization.simulator.perCoin', {
                price: formatPrice(
                  { currency: display.price.currency, amountMinor: display.minorPerCoin },
                  locale,
                ),
              })
            }}
          </p>
          <Message
            v-if="!display.price"
            severity="warn"
            :closable="false"
            size="small"
            class="mt-3"
          >
            {{ t('monetization.simulator.noPrice') }}
          </Message>
          <Message
            v-else-if="display.fallback"
            severity="info"
            :closable="false"
            size="small"
            class="mt-3"
          >
            {{ t('monetization.simulator.fallback', { currency: display.currency }) }}
          </Message>
          <Message
            v-if="!pack.isActive"
            severity="warn"
            :closable="false"
            size="small"
            class="mt-3"
          >
            {{ t('monetization.simulator.inactive') }}
          </Message>
        </div>
      </div>

      <!-- Phone frame: the shop as the app lists it for that country. -->
      <div
        class="mx-auto w-full max-w-[20rem] rounded-[2rem] border-8 border-surface-900 bg-surface-950 p-3 text-surface-0"
        :aria-label="t('monetization.simulator.phoneFrame')"
      >
        <p class="text-center text-xs text-surface-400">
          {{ t('monetization.simulator.allPacks') }} · {{ countryName(country, locale) }}
        </p>
        <h3 class="mt-2 text-base font-semibold">{{ t('monetization.simulator.phoneTitle') }}</h3>
        <ul class="mt-3 flex flex-col gap-2">
          <li
            v-for="item in shop"
            :key="item.pack.id"
            class="flex items-center justify-between rounded-lg px-3 py-2"
            :class="item.pack.id === packId ? 'bg-primary text-primary-contrast' : 'bg-surface-800'"
          >
            <div>
              <div class="text-sm font-semibold tabular-nums">
                {{ n(item.display.totalCoins) }} <i class="pi pi-circle-fill text-[0.6rem]" />
              </div>
              <div class="text-[0.65rem] opacity-80">
                <span v-if="item.pack.bonusCoins">+{{ n(item.pack.bonusCoins) }} bonus</span>
                <span v-if="item.pack.badge" class="ml-1 rounded bg-surface-0/20 px-1">{{
                  item.pack.badge
                }}</span>
              </div>
            </div>
            <span class="rounded-full bg-surface-0/15 px-2 py-1 text-xs font-semibold tabular-nums">
              {{ price(item.pack) }}
            </span>
          </li>
          <li v-if="shop.length === 0" class="py-6 text-center text-xs text-surface-400">
            {{ t('monetization.simulator.noPacks') }}
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
