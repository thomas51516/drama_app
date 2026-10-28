<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <NuxtLayout>
    <!-- Render errors of a page stay inside the shell; 401/403 are handled by useApi(). -->
    <NuxtErrorBoundary>
      <NuxtPage />
      <template #error="{ error, clearError }">
        <section
          class="mx-auto max-w-xl rounded-lg border border-red-200 bg-surface-0 p-8 text-center"
          role="alert"
        >
          <i class="pi pi-exclamation-triangle text-3xl text-red-600" aria-hidden="true" />
          <h1 class="mt-3 text-xl font-semibold">{{ t('errors.boundaryTitle') }}</h1>
          <p class="mt-2 text-sm text-muted-color">{{ t('errors.boundaryHint') }}</p>
          <pre
            class="mt-4 max-h-40 overflow-auto rounded bg-surface-100 p-3 text-left text-xs text-muted-color"
            >{{ error?.message ?? error }}</pre>
          <div class="mt-6 flex justify-center gap-2">
            <Button :label="t('common.retry')" icon="pi pi-refresh" @click="clearError()" />
            <NuxtLink to="/series" @click="clearError()">
              <Button :label="t('errors.goHome')" severity="secondary" outlined />
            </NuxtLink>
          </div>
        </section>
      </template>
    </NuxtErrorBoundary>
  </NuxtLayout>
</template>
