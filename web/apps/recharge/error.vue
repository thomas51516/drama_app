<script setup lang="ts">
import type { NuxtError } from '#app'

/** Fatal errors (unknown route, failed chunk): minimal screen with a way back to the packs. */
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const title = computed(() =>
  props.error.statusCode === 404 ? t('recharge.errors.notFound') : t('recharge.errors.fatal'),
)

function goHome(): void {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-surface-50 px-4 py-10">
    <div class="w-full max-w-sm rounded-2xl border border-surface-200 bg-surface-0 p-8 text-center">
      <p class="text-5xl font-semibold text-primary">{{ error.statusCode }}</p>
      <h1 class="mt-3 text-xl font-semibold">{{ title }}</h1>
      <p v-if="error.statusCode !== 404" class="mt-2 text-sm text-muted-color">
        {{ error.message }}
      </p>
      <Button class="mt-6" :label="t('recharge.nav.home')" icon="pi pi-home" @click="goHome" />
    </div>
  </div>
</template>
