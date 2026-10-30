<script setup lang="ts">
import { useRechargePrefs } from '#base/composables/useRechargePrefs'

/** Mobile-first shell of the recharge site: compact header, content, legal footer. */
const { t } = useI18n()
const api = useApi()
const session = useRechargeSession()
const prefs = useRechargePrefs()
const route = useRoute()

const links = computed(() => [
  { to: '/packs', label: t('recharge.nav.packs'), icon: 'pi pi-wallet' },
  ...(session.isAuthenticated
    ? [
        { to: '/history', label: t('recharge.nav.history'), icon: 'pi pi-history' },
        { to: '/account', label: t('recharge.nav.account'), icon: 'pi pi-user' },
      ]
    : [{ to: '/login', label: t('recharge.nav.signIn'), icon: 'pi pi-sign-in' }]),
])

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-surface-50">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-contrast"
    >
      {{ t('app.skipToContent') }}
    </a>

    <header class="sticky top-0 z-20 border-b border-surface-200 bg-surface-0/95 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <NuxtLink to="/" class="flex items-center gap-2" :aria-label="t('recharge.nav.home')">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-contrast"
            aria-hidden="true"
            >D</span
          >
          <span class="font-semibold">{{ t('recharge.brand') }}</span>
        </NuxtLink>
        <nav
          class="ml-auto hidden items-center gap-1 sm:flex"
          :aria-label="t('recharge.nav.label')"
        >
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="rounded-md px-3 py-1.5 text-sm hover:bg-surface-100"
            :class="isActive(link.to) ? 'font-medium text-primary' : 'text-surface-700'"
            :aria-current="isActive(link.to) ? 'page' : undefined"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
        <RechargeLanguageSelect class="ml-auto sm:ml-2" />
      </div>
    </header>

    <main
      id="main-content"
      class="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 sm:pb-10"
      tabindex="-1"
    >
      <Message v-if="api.isMock" severity="warn" :closable="false" size="small" class="mb-4">
        {{ t('recharge.mockBanner') }}
      </Message>
      <slot />
    </main>

    <!-- Bottom navigation on phones -->
    <nav
      class="fixed inset-x-0 bottom-0 z-20 border-t border-surface-200 bg-surface-0 sm:hidden"
      :aria-label="t('recharge.nav.label')"
    >
      <ul class="mx-auto flex max-w-3xl justify-around">
        <li v-for="link in links" :key="link.to" class="flex-1">
          <NuxtLink
            :to="link.to"
            class="flex flex-col items-center gap-0.5 py-2 text-xs"
            :class="isActive(link.to) ? 'font-medium text-primary' : 'text-surface-600'"
            :aria-current="isActive(link.to) ? 'page' : undefined"
          >
            <i :class="link.icon" class="text-lg" aria-hidden="true" />
            {{ link.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <footer class="border-t border-surface-200 bg-surface-0 pb-16 sm:pb-0">
      <div
        class="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-5 text-xs text-muted-color sm:flex-row sm:items-center sm:justify-between"
      >
        <p>
          {{ t('recharge.footer.copyright', { year: new Date().getFullYear() }) }} ·
          {{ t('recharge.footer.country', { country: prefs.country.value }) }}
        </p>
        <ul class="flex flex-wrap gap-x-4 gap-y-1">
          <li>
            <NuxtLink to="/legal/cgv" class="hover:underline">{{
              t('recharge.footer.terms')
            }}</NuxtLink>
          </li>
          <li>
            <NuxtLink to="/legal/confidentialite" class="hover:underline">{{
              t('recharge.footer.privacy')
            }}</NuxtLink>
          </li>
          <li>
            <a href="mailto:support@drama.app" class="hover:underline">{{
              t('recharge.footer.support')
            }}</a>
          </li>
        </ul>
      </div>
    </footer>

    <Toast position="top-center" />
  </div>
</template>
