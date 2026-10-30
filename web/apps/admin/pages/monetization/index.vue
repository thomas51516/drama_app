<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canManageMonetization } from '#base/utils/monetization'

/**
 * B-06 — monetization: settings, coin packs, VIP plans and the shop simulator.
 * MONETIZATION and ADMIN only (contract v1.4): other roles see « Droits insuffisants ».
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const allowed = computed(() => canManageMonetization(auth.user?.role))

const TABS = ['settings', 'packs', 'vip', 'simulator'] as const
type Tab = (typeof TABS)[number]
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'settings')
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'settings' ? undefined : value } })
})
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('monetization.title')"
      :subtitle="t('monetization.subtitle')"
      :crumbs="[{ label: t('nav.monetization') }]"
    />

    <LayoutForbidden v-if="!allowed" :hint="t('monetization.restricted')" />

    <Tabs v-else v-model:value="tab" lazy>
      <TabList>
        <Tab value="settings"
          ><i class="pi pi-sliders-h mr-2" aria-hidden="true" />{{
            t('monetization.tabs.settings')
          }}</Tab
        >
        <Tab value="packs"
          ><i class="pi pi-wallet mr-2" aria-hidden="true" />{{ t('monetization.tabs.packs') }}</Tab
        >
        <Tab value="vip"
          ><i class="pi pi-crown mr-2" aria-hidden="true" />{{ t('monetization.tabs.vip') }}</Tab
        >
        <Tab value="simulator"
          ><i class="pi pi-mobile mr-2" aria-hidden="true" />{{
            t('monetization.tabs.simulator')
          }}</Tab
        >
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="settings">
          <MonetizationSettingsPanel />
        </TabPanel>
        <TabPanel value="packs">
          <MonetizationPacksPanel />
        </TabPanel>
        <TabPanel value="vip">
          <MonetizationVipPlansPanel />
        </TabPanel>
        <TabPanel value="simulator">
          <MonetizationShopSimulator />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
