<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canManageMonetization } from '#base/utils/monetization'

/** B-08 — rewards: the check-in scale (M-40) and the reward tasks (M-41). MONETIZATION and ADMIN. */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const allowed = computed(() => canManageMonetization(auth.user?.role))

const TABS = ['checkin', 'tasks'] as const
type Tab = (typeof TABS)[number]
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'checkin')
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'checkin' ? undefined : value } })
})
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('rewards.title')"
      :subtitle="t('rewards.subtitle')"
      :crumbs="[{ label: t('nav.rewards') }]"
    />

    <LayoutForbidden v-if="!allowed" :hint="t('rewards.restricted')" />

    <Tabs v-else v-model:value="tab" lazy>
      <TabList>
        <Tab value="checkin"
          ><i class="pi pi-calendar-plus mr-2" aria-hidden="true" />{{
            t('rewards.tabs.checkin')
          }}</Tab
        >
        <Tab value="tasks"
          ><i class="pi pi-check-square mr-2" aria-hidden="true" />{{
            t('rewards.tabs.tasks')
          }}</Tab
        >
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="checkin">
          <RewardsCheckinScaleEditor />
        </TabPanel>
        <TabPanel value="tasks">
          <RewardsTasksPanel />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
