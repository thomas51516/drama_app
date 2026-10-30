<script setup lang="ts">
import { backofficeModules, moduleAllowsRole } from '../../utils/modules'
import { useSupportInboxStore } from '../../stores/support-inbox'

defineProps<{
  /** Rendered inside the mobile drawer: no brand header. */
  compact?: boolean
}>()

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const inbox = useSupportInboxStore()

/** Modules the current role may open; the others are hidden rather than greyed out. */
const modules = computed(() =>
  backofficeModules.filter((module) => moduleAllowsRole(module, auth.user?.role)),
)

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`)
}

function childrenFor(module: (typeof backofficeModules)[number]) {
  return (module.children ?? []).filter((child) => moduleAllowsRole(child, auth.user?.role))
}

function badgeFor(module: (typeof backofficeModules)[number]): number | null {
  if (module.badge === 'supportInbox') return inbox.openCount
  return null
}

onMounted(() => {
  void inbox.refresh()
})
</script>

<template>
  <nav class="flex h-full flex-col" :aria-label="t('app.backoffice')">
    <div v-if="!compact" class="flex h-16 items-center gap-2 border-b border-surface-200 px-5">
      <span
        class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-contrast"
        aria-hidden="true"
      >
        D
      </span>
      <div class="leading-tight">
        <div class="font-semibold">{{ t('app.name') }}</div>
        <div class="text-xs text-muted-color">{{ t('app.backoffice') }}</div>
      </div>
    </div>

    <ul class="flex-1 space-y-0.5 overflow-y-auto p-3">
      <li v-for="module in modules" :key="module.key">
        <NuxtLink
          :to="module.path"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-surface-100"
          :class="
            isActive(module.path) ? 'bg-primary-50 font-medium text-primary' : 'text-surface-700'
          "
          :aria-current="isActive(module.path) ? 'page' : undefined"
        >
          <i :class="module.icon" class="text-base" aria-hidden="true" />
          <span class="flex-1 truncate">{{ t(module.labelKey) }}</span>
          <Badge
            v-if="badgeFor(module)"
            :value="badgeFor(module) ?? 0"
            severity="warn"
            size="small"
            :aria-label="
              t('nav.openTickets', { count: badgeFor(module) ?? 0 }, badgeFor(module) ?? 0)
            "
            data-testid="sidebar-badge"
          />
          <span class="text-[10px] uppercase tracking-wide text-muted-color">{{
            module.ticket
          }}</span>
        </NuxtLink>
        <ul v-if="childrenFor(module).length > 0" class="mt-0.5 space-y-0.5 pl-9">
          <li v-for="child in childrenFor(module)" :key="child.key">
            <NuxtLink
              :to="child.path"
              class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-surface-100"
              :class="
                isActive(child.path) ? 'bg-primary-50 font-medium text-primary' : 'text-surface-600'
              "
              :aria-current="isActive(child.path) ? 'page' : undefined"
              data-testid="sidebar-subpage"
            >
              <i class="pi pi-angle-right text-xs" aria-hidden="true" />
              <span class="truncate">{{ t(child.labelKey) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>
