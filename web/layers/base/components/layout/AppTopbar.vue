<script setup lang="ts">
import type { AdminRole } from '../../types/api'

const emit = defineEmits<{ toggleMenu: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const loggingOut = ref(false)

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
    await auth.logout()
  } finally {
    loggingOut.value = false
  }
  await navigateTo('/login', { replace: true })
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

    <div v-if="auth.user" class="flex min-w-0 items-center gap-3">
      <Avatar :label="initials" shape="circle" class="shrink-0" />
      <div class="hidden min-w-0 leading-tight sm:block">
        <div class="truncate text-sm font-medium" :title="auth.user.email">
          {{ auth.user.displayName }}
        </div>
        <div class="truncate text-xs text-muted-color">{{ roleLabel }}</div>
      </div>
    </div>

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

    <Button
      icon="pi pi-sign-out"
      :label="t('auth.logout')"
      severity="secondary"
      outlined
      size="small"
      :loading="loggingOut"
      class="shrink-0"
      @click="onLogout"
    />
  </header>
</template>
