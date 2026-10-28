<script setup lang="ts">
import type { NuxtError } from '#app'

/** Fatal errors outside a page (unknown route, failed chunk): minimal French screen. */
const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()

const title = computed(() =>
  props.error.statusCode === 404 ? t('errors.pageNotFound') : t('errors.boundaryTitle'),
)

function goHome(): void {
  clearError({ redirect: '/series' })
}
</script>

<template>
  <div class="flex min-h-full items-center justify-center bg-surface-100 px-4 py-10">
    <Card class="w-full max-w-md text-center">
      <template #content>
        <p class="text-5xl font-semibold text-primary">{{ error.statusCode }}</p>
        <h1 class="mt-3 text-xl font-semibold">{{ title }}</h1>
        <p v-if="error.statusCode !== 404" class="mt-2 text-sm text-muted-color">
          {{ error.message }}
        </p>
        <Button class="mt-6" :label="t('errors.goHome')" icon="pi pi-home" @click="goHome" />
      </template>
    </Card>
  </div>
</template>
