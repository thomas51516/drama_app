<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canManageMonetization } from '#base/utils/monetization'

/**
 * B-07 — offers and promos (contract v1.5): welcome offer, limited offers on a pack and promo
 * codes. MONETIZATION and ADMIN only; other roles see « Droits insuffisants » without a call.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const monetizationApi = useMonetizationApi()

const allowed = computed(() => canManageMonetization(auth.user?.role))

const TABS = ['offers', 'promo'] as const
type Tab = (typeof TABS)[number]
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'offers')
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'offers' ? undefined : value } })
})

// Packs feed the pickers of every panel (one call for the page).
const { data: packs } = useAsyncData(
  'admin-offers-packs',
  () => (allowed.value ? monetizationApi.listPacks() : Promise.resolve([])),
  { default: () => [] },
)
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('offers.title')"
      :subtitle="t('offers.subtitle')"
      :crumbs="[{ label: t('nav.offers') }]"
    />

    <LayoutForbidden v-if="!allowed" :hint="t('offers.restricted')" />

    <Tabs v-else v-model:value="tab" lazy>
      <TabList>
        <Tab value="offers"
          ><i class="pi pi-tag mr-2" aria-hidden="true" />{{ t('offers.tabs.offers') }}</Tab
        >
        <Tab value="promo"
          ><i class="pi pi-ticket mr-2" aria-hidden="true" />{{ t('offers.tabs.promo') }}</Tab
        >
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="offers">
          <div class="flex flex-col gap-8">
            <OffersWelcomeOfferCard :packs="packs" />
            <OffersLimitedOffersPanel :packs="packs" />
          </div>
        </TabPanel>
        <TabPanel value="promo">
          <OffersPromoCodesPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
