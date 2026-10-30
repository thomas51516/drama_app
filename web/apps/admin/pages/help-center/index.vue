<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { canManageFaq, canUseSupportInbox } from '#base/utils/help-center'

/**
 * B-03bis — help center: FAQ (EDITOR, SUPPORT, ADMIN) and support inbox (SUPPORT, ADMIN).
 * MONETIZATION sees « Droits insuffisants » without an API call.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const inbox = useSupportInboxStore()

const allowed = computed(() => canManageFaq(auth.user?.role))
const supportAllowed = computed(() => canUseSupportInbox(auth.user?.role))

const TABS = ['faq', 'support'] as const
type Tab = (typeof TABS)[number]
const requested = route.query.tab as Tab
const tab = ref<Tab>(
  TABS.includes(requested) && (requested !== 'support' || supportAllowed.value) ? requested : 'faq',
)
watch(tab, (value) => {
  void router.replace({ query: { ...route.query, tab: value === 'faq' ? undefined : value } })
})
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('helpCenter.title')"
      :subtitle="t('helpCenter.subtitle')"
      :crumbs="[{ label: t('helpCenter.title') }]"
    />

    <LayoutForbidden v-if="!allowed" :hint="t('helpCenter.restricted')" />

    <Tabs v-else v-model:value="tab" lazy>
      <TabList>
        <Tab value="faq"
          ><i class="pi pi-question-circle mr-2" aria-hidden="true" />{{
            t('helpCenter.tabs.faq')
          }}</Tab
        >
        <Tab v-if="supportAllowed" value="support">
          <i class="pi pi-inbox mr-2" aria-hidden="true" />{{ t('helpCenter.tabs.support') }}
          <Badge
            v-if="inbox.openCount"
            :value="inbox.openCount"
            severity="warn"
            size="small"
            class="ml-2"
          />
        </Tab>
      </TabList>
      <TabPanels class="!px-0">
        <TabPanel value="faq">
          <HelpCenterFaqPanel />
        </TabPanel>
        <TabPanel v-if="supportAllowed" value="support">
          <HelpCenterSupportInbox />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
