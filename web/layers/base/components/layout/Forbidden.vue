<script setup lang="ts">
/** Shown in place of a page the current role cannot use (e.g. B-13 is ADMIN-only). */
defineProps<{ hint?: string }>()
const { t } = useI18n()
</script>

<template>
  <section
    class="mx-auto max-w-xl rounded-lg border border-dashed border-surface-300 bg-surface-0 p-10 text-center"
    data-testid="forbidden"
  >
    <i class="pi pi-lock text-4xl text-muted-color" aria-hidden="true" />
    <h2 class="mt-4 text-xl font-semibold">{{ t('errors.forbidden') }}</h2>
    <p class="mt-2 text-sm text-muted-color">{{ hint ?? t('errors.forbiddenHint') }}</p>
    <NuxtLink to="/series" class="mt-6 inline-block">
      <Button :label="t('module.backToCatalogue')" severity="secondary" outlined size="small" />
    </NuxtLink>
  </section>
</template>
