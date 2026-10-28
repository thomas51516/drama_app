<script setup lang="ts">
import type { BackofficeModule } from '../../utils/modules'

defineProps<{ module: BackofficeModule }>()
const { t } = useI18n()
</script>

<template>
  <section class="mx-auto max-w-xl rounded-lg border border-dashed border-surface-300 bg-surface-0 p-10 text-center">
    <i :class="module.icon" class="text-4xl text-muted-color" aria-hidden="true" />
    <h1 class="mt-4 text-xl font-semibold">{{ t(module.labelKey) }}</h1>
    <p class="mt-2 font-medium text-primary">{{ t('module.comingSoon', { ticket: module.ticket }) }}</p>
    <p class="mt-2 text-sm text-muted-color">{{ t('module.hint') }}</p>
    <NuxtLink to="/series" class="mt-6 inline-block">
      <Button :label="t('module.backToCatalogue')" severity="secondary" outlined size="small" />
    </NuxtLink>
  </section>
</template>
