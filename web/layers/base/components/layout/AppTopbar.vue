<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'
import type { AdminRole } from '../../types/api'

const emit = defineEmits<{ toggleMenu: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const loggingOut = ref(false)
const userMenu = ref<{ toggle: (event: Event) => void } | null>(null)

const roleLabel = computed(() =>
  auth.user ? t(`auth.roles.${auth.user.role satisfies AdminRole}`) : '',
)

const initials = computed(() => {
  const name = auth.user?.displayName ?? auth.user?.email ?? '?'
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
})

async function onLogout(): Promise<void> {
  loggingOut.value = true
  try {
    // Logout is not a revocation: the trusted-device cookie survives (B-13+).
    await auth.logout()
  } finally {
    loggingOut.value = false
  }
  await navigateTo('/login', { replace: true })
}

/** User menu: « Mon compte » (profile + trusted devices) and sign out. */
const menuItems = computed<MenuItem[]>(() => [
  {
    label: auth.user?.displayName ?? '',
    items: [
      {
        label: t('account.title'),
        icon: 'pi pi-user',
        command: () => void navigateTo('/account'),
      },
      {
        label: t('auth.logout'),
        icon: 'pi pi-sign-out',
        disabled: loggingOut.value,
        command: () => void onLogout(),
      },
    ],
  },
])

function toggleUserMenu(event: Event): void {
  userMenu.value?.toggle(event)
}
</script>

<template>
  <header
    class="flex h-16 items-center gap-3 border-b border-surface-200 bg-surface-0 px-4 lg:px-8"
  >
    <Button
      icon="pi pi-bars"
      text
      rounded
      severity="secondary"
      class="lg:!hidden"
      :aria-label="t('app.openMenu')"
      @click="emit('toggleMenu')"
    />

    <div class="min-w-0 flex-1 lg:hidden">
      <span class="font-semibold">{{ t('app.name') }}</span>
      <span class="text-muted-color"> · {{ t('app.backoffice') }}</span>
    </div>
    <div class="hidden flex-1 lg:block" />

    <NuxtLink to="/help" class="shrink-0">
      <Button
        icon="pi pi-question-circle"
        :label="t('app.help')"
        severity="secondary"
        text
        size="small"
        :aria-label="t('help.open')"
        :title="t('help.open')"
      />
    </NuxtLink>

    <template v-if="auth.user">
      <button
        type="button"
        class="flex min-w-0 items-center gap-3 rounded-md px-2 py-1 text-left hover:bg-surface-100"
        :aria-label="t('auth.userMenu')"
        aria-haspopup="menu"
        data-testid="user-menu-button"
        @click="toggleUserMenu"
      >
        <Avatar :label="initials" shape="circle" class="shrink-0" />
        <span class="hidden min-w-0 leading-tight sm:block">
          <span class="block truncate text-sm font-medium" :title="auth.user.email">
            {{ auth.user.displayName }}
          </span>
          <span class="block truncate text-xs text-muted-color">{{ roleLabel }}</span>
        </span>
        <i class="pi pi-angle-down text-xs text-muted-color" aria-hidden="true" />
      </button>
      <Menu ref="userMenu" :model="menuItems" popup />
    </template>

    <Button
      icon="pi pi-sign-out"
      severity="secondary"
      outlined
      size="small"
      :loading="loggingOut"
      class="shrink-0"
      :aria-label="t('auth.logout')"
      :title="t('auth.logout')"
      @click="onLogout"
    />
  </header>
</template>
