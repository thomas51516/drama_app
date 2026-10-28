<script setup lang="ts">
import { backofficeModules } from '../../utils/modules'

defineProps<{
  /** Rendered inside the mobile drawer: no brand header. */
  compact?: boolean
}>()

const { t } = useI18n()
const route = useRoute()

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`)
}
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
      <li v-for="module in backofficeModules" :key="module.key">
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
          <span class="text-[10px] uppercase tracking-wide text-muted-color">{{
            module.ticket
          }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
