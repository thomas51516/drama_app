<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries } from '../../types/api'
import { useCatalogueApi } from '../../composables/useCatalogueApi'

/**
 * Entry of the per-series modules (B-02 episodes, B-03 subtitles): pick a series, then the
 * caller navigates to its episodes page.
 */
const props = defineProps<{
  title: string
  hint: string
}>()
const emit = defineEmits<{ select: [series: AdminSeries] }>()

const { t } = useI18n()
const api = useCatalogueApi()

const { data, status } = await useAsyncData('admin-series-picker', () =>
  api.listSeries({ page: 1, pageSize: 100 }),
)
const options = computed<AdminSeries[]>(() => data.value?.items ?? [])
const selected = ref<AdminSeries | null>(null)

watch(selected, (series) => {
  if (series) emit('select', series)
})
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <LayoutPageHeader
      :title="props.title"
      :subtitle="props.hint"
      :crumbs="[{ label: props.title }]"
    />
    <div class="rounded-lg border border-surface-200 bg-surface-0 p-6">
      <label for="episodes-series-picker" class="mb-2 block text-sm font-medium">
        {{ t('episodes.pickSeries.title') }}
      </label>
      <Select
        v-model="selected"
        input-id="episodes-series-picker"
        :options="options"
        option-label="title"
        filter
        :loading="status === 'pending'"
        :placeholder="t('episodes.pickSeries.placeholder')"
        fluid
      >
        <template #option="{ option }: { option: AdminSeries }">
          <div class="flex w-full items-center justify-between gap-3">
            <span>{{ option.title }}</span>
            <span class="text-xs text-muted-color">
              {{ t('episodes.count', { count: option.episodeCount }, option.episodeCount) }}
            </span>
          </div>
        </template>
      </Select>
    </div>
  </div>
</template>
