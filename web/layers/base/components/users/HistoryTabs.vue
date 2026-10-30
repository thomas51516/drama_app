<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminUserPurchase, AdminUserUnlock, LedgerEntry } from '../../types/api'
import { formatPrice, isCurrency } from '../../utils/monetization'
import {
  USER_LIST_PAGE_SIZE,
  ledgerTypeSeverity,
  normalizeUnlockMethod,
  paginate,
  sortLedger,
} from '../../utils/users'

/**
 * History of a user (B-09): unlocks, purchases and the ledger, each paginated client-side
 * (the detail endpoint embeds the lists; 20 rows per page).
 */
const props = defineProps<{
  unlocks: AdminUserUnlock[]
  purchases: AdminUserPurchase[]
  ledger: LedgerEntry[]
}>()

const { t, n, d, locale } = useI18n()

type Tab = 'unlocks' | 'purchases' | 'ledger'
const tab = ref<Tab>('ledger')
const pages = ref<Record<Tab, number>>({ unlocks: 1, purchases: 1, ledger: 1 })
watch(
  () => [props.unlocks.length, props.purchases.length, props.ledger.length],
  () => {
    pages.value = { unlocks: 1, purchases: 1, ledger: 1 }
  },
)

const sortedLedger = computed(() => sortLedger(props.ledger))
const unlockRows = computed(() => paginate(props.unlocks, pages.value.unlocks))
const purchaseRows = computed(() => paginate(props.purchases, pages.value.purchases))
const ledgerRows = computed(() => paginate(sortedLedger.value, pages.value.ledger))

function onPage(key: Tab, event: { page: number }): void {
  pages.value = { ...pages.value, [key]: event.page + 1 }
}

function formatDate(iso: string | null): string {
  return iso ? d(new Date(iso), 'short') : '—'
}

function amountOf(purchase: AdminUserPurchase): string {
  if (purchase.amountMinor === null || !isCurrency(purchase.currency)) return '—'
  return formatPrice(
    { currency: purchase.currency, amountMinor: purchase.amountMinor },
    locale.value,
  )
}
</script>

<template>
  <Tabs v-model:value="tab" lazy data-testid="user-history">
    <TabList>
      <Tab value="unlocks"
        ><i class="pi pi-lock-open mr-2" aria-hidden="true" />{{ t('users.tabs.unlocks') }}
        <Badge :value="unlocks.length" severity="secondary" size="small" class="ml-2"
      /></Tab>
      <Tab value="purchases"
        ><i class="pi pi-shopping-cart mr-2" aria-hidden="true" />{{ t('users.tabs.purchases') }}
        <Badge :value="purchases.length" severity="secondary" size="small" class="ml-2"
      /></Tab>
      <Tab value="ledger"
        ><i class="pi pi-book mr-2" aria-hidden="true" />{{ t('users.tabs.ledger') }}
        <Badge :value="ledger.length" severity="secondary" size="small" class="ml-2"
      /></Tab>
    </TabList>
    <TabPanels class="!px-0">
      <TabPanel value="unlocks">
        <DataTable
          :value="unlockRows"
          data-key="episodeId"
          striped-rows
          class="rounded-lg border border-surface-200 bg-surface-0"
        >
          <template #empty>
            <p class="py-8 text-center text-sm text-muted-color">{{ t('users.unlocks.empty') }}</p>
          </template>
          <Column :header="t('users.unlocks.columns.series')">
            <template #body="{ data: row }: { data: AdminUserUnlock }">
              <NuxtLink
                v-if="row.seriesId"
                :to="`/series/${row.seriesId}`"
                class="font-medium hover:underline"
                >{{ row.seriesTitle }}</NuxtLink
              >
              <span v-else class="font-medium">{{ row.seriesTitle }}</span>
            </template>
          </Column>
          <Column :header="t('users.unlocks.columns.episode')" class="w-36">
            <template #body="{ data: row }: { data: AdminUserUnlock }">
              {{ t('users.unlocks.episodeNumber', { number: row.episodeNumber }) }}
            </template>
          </Column>
          <Column :header="t('users.unlocks.columns.method')" class="w-40">
            <template #body="{ data: row }: { data: AdminUserUnlock }">
              <Tag
                :value="t(`users.unlocks.method.${normalizeUnlockMethod(row.method)}`)"
                severity="secondary"
              />
            </template>
          </Column>
          <Column :header="t('users.unlocks.columns.at')" class="w-44">
            <template #body="{ data: row }: { data: AdminUserUnlock }">
              <span class="text-sm tabular-nums">{{ formatDate(row.at) }}</span>
            </template>
          </Column>
        </DataTable>
        <Paginator
          v-if="unlocks.length > USER_LIST_PAGE_SIZE"
          :rows="USER_LIST_PAGE_SIZE"
          :total-records="unlocks.length"
          :first="(pages.unlocks - 1) * USER_LIST_PAGE_SIZE"
          class="mt-2"
          @page="onPage('unlocks', $event)"
        />
      </TabPanel>

      <TabPanel value="purchases">
        <DataTable
          :value="purchaseRows"
          data-key="id"
          striped-rows
          class="rounded-lg border border-surface-200 bg-surface-0"
        >
          <template #empty>
            <p class="py-8 text-center text-sm text-muted-color">
              {{ t('users.purchases.empty') }}
            </p>
          </template>
          <Column :header="t('users.purchases.columns.product')">
            <template #body="{ data: row }: { data: AdminUserPurchase }">
              <span class="font-mono text-sm">{{ row.productId }}</span>
              <Tag
                v-if="row.type === 'subs'"
                :value="t('users.purchases.subscription')"
                severity="info"
                class="ml-2"
              />
            </template>
          </Column>
          <Column :header="t('users.purchases.columns.amount')" class="w-36 text-right">
            <template #body="{ data: row }: { data: AdminUserPurchase }">
              <span class="tabular-nums">{{ amountOf(row) }}</span>
            </template>
          </Column>
          <Column :header="t('users.purchases.columns.coins')" class="w-32 text-right">
            <template #body="{ data: row }: { data: AdminUserPurchase }">
              <span v-if="row.coins || row.bonusCoins" class="tabular-nums"
                >{{ n(row.coins)
                }}<span v-if="row.bonusCoins" class="text-muted-color">
                  +{{ n(row.bonusCoins) }}</span
                ></span
              >
              <span v-else class="text-muted-color">—</span>
            </template>
          </Column>
          <Column :header="t('users.purchases.columns.status')" class="w-36">
            <template #body="{ data: row }: { data: AdminUserPurchase }">
              <Tag
                :value="row.status"
                :severity="
                  row.status === 'REFUNDED' || row.status === 'FAILED'
                    ? 'danger'
                    : row.status === 'PENDING'
                      ? 'warn'
                      : 'success'
                "
              />
            </template>
          </Column>
          <Column :header="t('users.purchases.columns.at')" class="w-44">
            <template #body="{ data: row }: { data: AdminUserPurchase }">
              <span class="text-sm tabular-nums">{{ formatDate(row.createdAt) }}</span>
            </template>
          </Column>
        </DataTable>
        <Paginator
          v-if="purchases.length > USER_LIST_PAGE_SIZE"
          :rows="USER_LIST_PAGE_SIZE"
          :total-records="purchases.length"
          :first="(pages.purchases - 1) * USER_LIST_PAGE_SIZE"
          class="mt-2"
          @page="onPage('purchases', $event)"
        />
      </TabPanel>

      <TabPanel value="ledger">
        <p class="mb-2 text-xs text-muted-color">{{ t('users.ledger.hint') }}</p>
        <DataTable
          :value="ledgerRows"
          data-key="id"
          striped-rows
          class="rounded-lg border border-surface-200 bg-surface-0"
          data-testid="ledger-table"
        >
          <template #empty>
            <p class="py-8 text-center text-sm text-muted-color">{{ t('users.ledger.empty') }}</p>
          </template>
          <Column :header="t('users.ledger.columns.at')" class="w-44">
            <template #body="{ data: row }: { data: LedgerEntry }">
              <span class="text-sm tabular-nums">{{ formatDate(row.createdAt) }}</span>
            </template>
          </Column>
          <Column :header="t('users.ledger.columns.type')" class="w-36">
            <template #body="{ data: row }: { data: LedgerEntry }">
              <Tag
                :value="t(`users.ledger.type.${row.type}`)"
                :severity="ledgerTypeSeverity(row.type)"
              />
            </template>
          </Column>
          <Column :header="t('users.ledger.columns.bucket')" class="w-28">
            <template #body="{ data: row }: { data: LedgerEntry }">
              <span class="text-sm">{{ t(`users.bucket.${row.bucket}`) }}</span>
            </template>
          </Column>
          <Column :header="t('users.ledger.columns.amount')" class="w-24 text-right">
            <template #body="{ data: row }: { data: LedgerEntry }">
              <span
                class="font-medium tabular-nums"
                :class="row.amount < 0 ? 'text-red-600' : 'text-green-700'"
                >{{ row.amount > 0 ? '+' : '' }}{{ n(row.amount) }}</span
              >
            </template>
          </Column>
          <Column :header="t('users.ledger.columns.description')">
            <template #body="{ data: row }: { data: LedgerEntry }">
              <span class="text-sm">{{ row.description ?? '' }}</span>
              <span v-if="row.reference" class="ml-2 font-mono text-xs text-muted-color">{{
                row.reference
              }}</span>
            </template>
          </Column>
          <Column :header="t('users.ledger.columns.expiresAt')" class="w-36">
            <template #body="{ data: row }: { data: LedgerEntry }">
              <span class="text-sm tabular-nums">{{ formatDate(row.expiresAt) }}</span>
            </template>
          </Column>
        </DataTable>
        <Paginator
          v-if="ledger.length > USER_LIST_PAGE_SIZE"
          :rows="USER_LIST_PAGE_SIZE"
          :total-records="ledger.length"
          :first="(pages.ledger - 1) * USER_LIST_PAGE_SIZE"
          class="mt-2"
          @page="onPage('ledger', $event)"
        />
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>
