<script setup lang="ts">
export interface Crumb {
  label: string
  to?: string
}

/** Page title, optional subtitle, breadcrumb (home = catalogue) and an actions slot. */
defineProps<{
  title: string
  subtitle?: string
  /** Trail after the catalogue root; the last item is the current page. */
  crumbs?: Crumb[]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mb-6">
    <nav v-if="crumbs && crumbs.length > 0" :aria-label="t('breadcrumb.label')" class="mb-3">
      <ol class="flex flex-wrap items-center gap-1 text-sm text-muted-color">
        <li>
          <NuxtLink to="/series" class="hover:text-primary hover:underline">
            {{ t('breadcrumb.home') }}
          </NuxtLink>
        </li>
        <li v-for="(crumb, index) in crumbs" :key="index" class="flex items-center gap-1">
          <i class="pi pi-angle-right text-xs" aria-hidden="true" />
          <NuxtLink
            v-if="crumb.to && index < crumbs.length - 1"
            :to="crumb.to"
            class="hover:text-primary hover:underline"
          >
            {{ crumb.label }}
          </NuxtLink>
          <span
            v-else
            class="max-w-xs truncate text-surface-900"
            :aria-current="index === crumbs.length - 1 ? 'page' : undefined"
          >
            {{ crumb.label }}
          </span>
        </li>
      </ol>
    </nav>

    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-sm text-muted-color">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
