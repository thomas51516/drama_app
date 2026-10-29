<script setup lang="ts">
import { computed } from 'vue'
import type { AdminSeries } from '../../types/api'
import { moveItem } from '../../utils/featured'

/** Ordered multi-picker of series for `MANUAL` rows: add with search, move up/down, remove. */
const props = defineProps<{
  modelValue: string[]
  seriesById: Record<string, AdminSeries>
  disabled?: boolean
  invalid?: boolean
  inputId?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  /** A series picked from search, so the parent can cache it in `seriesById`. */
  resolved: [series: AdminSeries]
}>()

const { t } = useI18n()

const items = computed(() =>
  props.modelValue.map((id) => ({ id, series: props.seriesById[id] ?? null })),
)

function add(series: AdminSeries): void {
  emit('resolved', series)
  if (props.modelValue.includes(series.id)) return
  emit('update:modelValue', [...props.modelValue, series.id])
}

function remove(id: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item !== id),
  )
}

function move(index: number, delta: number): void {
  emit('update:modelValue', moveItem(props.modelValue, index, index + delta))
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <FeaturedSeriesPicker
      :model-value="null"
      :series-by-id="seriesById"
      :exclude="modelValue"
      :disabled="disabled"
      :invalid="invalid"
      :input-id="inputId"
      :placeholder="t('featured.rows.form.addSeries')"
      clear-on-select
      @select="add"
    />
    <ol
      v-if="items.length > 0"
      class="divide-y divide-surface-200 rounded-md border border-surface-200"
      data-testid="manual-series-list"
    >
      <li v-for="(item, index) in items" :key="item.id" class="flex items-center gap-2 px-3 py-2">
        <span class="w-6 text-right text-sm tabular-nums text-muted-color">{{ index + 1 }}</span>
        <span class="h-10 w-7 shrink-0 overflow-hidden rounded bg-surface-200">
          <img
            v-if="item.series?.posterVerticalUrl"
            :src="item.series.posterVerticalUrl"
            alt=""
            class="h-full w-full object-cover"
          />
        </span>
        <span class="min-w-0 flex-1 truncate text-sm">{{ item.series?.title ?? item.id }}</span>
        <Button
          icon="pi pi-arrow-up"
          size="small"
          text
          severity="secondary"
          :disabled="disabled || index === 0"
          :aria-label="t('featured.actions.moveUp')"
          @click="move(index, -1)"
        />
        <Button
          icon="pi pi-arrow-down"
          size="small"
          text
          severity="secondary"
          :disabled="disabled || index === items.length - 1"
          :aria-label="t('featured.actions.moveDown')"
          @click="move(index, 1)"
        />
        <Button
          icon="pi pi-times"
          size="small"
          text
          severity="danger"
          :disabled="disabled"
          :aria-label="t('common.remove')"
          @click="remove(item.id)"
        />
      </li>
    </ol>
    <p v-else class="text-xs text-muted-color">{{ t('featured.rows.form.noSeries') }}</p>
  </div>
</template>
