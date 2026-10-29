<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries } from '../../types/api'
import { useCatalogueApi } from '../../composables/useCatalogueApi'

/**
 * Single series picker with remote search (`GET /admin/series?q=`), used by banners and the
 * manual rows editor. `seriesById` gives the label of an id selected earlier (edit mode).
 */
const props = defineProps<{
  modelValue: string | null
  seriesById?: Record<string, AdminSeries>
  disabled?: boolean
  invalid?: boolean
  inputId?: string
  placeholder?: string
  /** Ids hidden from the suggestions (already in the list). */
  exclude?: string[]
  /** Keep the field empty after a pick (add-to-list mode). */
  clearOnSelect?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  select: [series: AdminSeries]
}>()

const { t } = useI18n()
const api = useCatalogueApi()

const suggestions = ref<AdminSeries[]>([])
const searching = ref(false)
const selected = ref<AdminSeries | string | null>(null)

const known = computed(() => props.seriesById ?? {})

watch(
  () => props.modelValue,
  (id) => {
    if (!id) {
      selected.value = null
      return
    }
    const current = typeof selected.value === 'object' ? selected.value : null
    if (current?.id === id) return
    selected.value = known.value[id] ?? ({ id, title: id } as AdminSeries)
  },
  { immediate: true },
)

async function search(event: { query: string }): Promise<void> {
  searching.value = true
  try {
    const page = await api.listSeries({ q: event.query, page: 1, pageSize: 20 })
    const excluded = new Set(props.exclude ?? [])
    suggestions.value = page.items.filter((series) => !excluded.has(series.id))
  } catch {
    suggestions.value = []
  } finally {
    searching.value = false
  }
}

function onSelect(event: { value: AdminSeries }): void {
  emit('select', event.value)
  if (props.clearOnSelect) {
    selected.value = null
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', event.value.id)
  }
}

function onUpdate(value: AdminSeries | string | null): void {
  selected.value = value
  // Free text (no suggestion picked) does not select anything.
  if (!value || typeof value === 'string') emit('update:modelValue', null)
}
</script>

<template>
  <AutoComplete
    :model-value="selected"
    :suggestions="suggestions"
    option-label="title"
    dropdown
    :loading="searching"
    :disabled="disabled"
    :invalid="invalid"
    :input-id="inputId"
    :placeholder="placeholder ?? t('featured.seriesPicker.placeholder')"
    :complete-on-focus="true"
    :min-length="0"
    fluid
    force-selection
    @complete="search"
    @option-select="onSelect"
    @update:model-value="onUpdate"
  >
    <template #option="{ option }: { option: AdminSeries }">
      <div class="flex items-center gap-3">
        <span class="h-10 w-7 shrink-0 overflow-hidden rounded bg-surface-200">
          <img
            v-if="option.posterVerticalUrl"
            :src="option.posterVerticalUrl"
            alt=""
            class="h-full w-full object-cover"
          />
        </span>
        <span class="min-w-0">
          <span class="block truncate">{{ option.title }}</span>
          <span class="block text-xs text-muted-color">
            {{ t(`series.status.${option.status}`) }} ·
            {{ t('episodes.count', { count: option.episodeCount }, option.episodeCount) }}
          </span>
        </span>
      </div>
    </template>
  </AutoComplete>
</template>
