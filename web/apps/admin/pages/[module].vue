<script setup lang="ts">
import { findModuleByPath } from '#base/utils/modules'

definePageMeta({
  validate: (route) => findModuleByPath(route.path) !== undefined,
})

const route = useRoute()
const module = computed(() => findModuleByPath(route.path))
</script>

<template>
  <LayoutComingSoon v-if="module" :module="module" />
</template>
