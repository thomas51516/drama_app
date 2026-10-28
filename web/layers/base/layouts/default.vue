<script setup lang="ts">
const { t } = useI18n()
const api = useApi()
const mobileMenuOpen = ref(false)
const route = useRoute()

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
  },
)
</script>

<template>
  <div class="flex min-h-full">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-contrast"
    >
      {{ t('app.skipToContent') }}
    </a>

    <!-- Desktop sidebar -->
    <aside class="hidden w-64 shrink-0 border-r border-surface-200 bg-surface-0 lg:block">
      <LayoutAppSidebar />
    </aside>

    <!-- Mobile sidebar -->
    <Drawer v-model:visible="mobileMenuOpen" position="left" class="!w-72" :show-close-icon="true">
      <template #header>
        <span class="font-semibold">{{ t('app.name') }}</span>
      </template>
      <LayoutAppSidebar :compact="true" />
    </Drawer>

    <div class="flex min-w-0 flex-1 flex-col">
      <LayoutAppTopbar @toggle-menu="mobileMenuOpen = !mobileMenuOpen" />

      <Message v-if="api.isMock" severity="warn" :closable="false" class="mx-4 mt-4 lg:mx-8">
        {{ t('common.mockBanner') }}
      </Message>

      <main id="main-content" class="flex-1 px-4 py-6 lg:px-8" tabindex="-1">
        <slot />
      </main>
    </div>

    <!-- Global outlets: toasts (success/errors) and confirmation dialogs -->
    <Toast position="top-right" />
    <ConfirmDialog :style="{ width: 'min(28rem, 95vw)' }" />
  </div>
</template>
