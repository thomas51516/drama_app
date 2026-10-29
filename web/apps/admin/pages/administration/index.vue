<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/** B-13 — internal accounts and audit log. ADMIN only: other roles see « Droits insuffisants ». */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const TABS = ['accounts', 'audit'] as const
type Tab = (typeof TABS)[number]
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'accounts')
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'accounts' ? undefined : value } })
})

const isAdmin = computed(() => auth.user?.role === 'ADMIN')
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('administration.title')"
      :subtitle="t('administration.subtitle')"
      :crumbs="[{ label: t('administration.title') }]"
    />

    <LayoutForbidden v-if="!isAdmin" :hint="t('administration.adminOnly')" />

    <Tabs v-else v-model:value="tab" lazy>
      <TabList>
        <Tab value="accounts"
          ><i class="pi pi-users mr-2" aria-hidden="true" />{{
            t('administration.tabs.accounts')
          }}</Tab
        >
        <Tab value="audit"
          ><i class="pi pi-history mr-2" aria-hidden="true" />{{
            t('administration.tabs.audit')
          }}</Tab
        >
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="accounts">
          <AdministrationAccountsPanel />
        </TabPanel>
        <TabPanel value="audit">
          <AdministrationAuditLogPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
