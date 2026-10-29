<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AdminSeries, HomeRow } from '../../types/api'
import { useFeaturedApi } from '../../composables/useFeaturedApi'
import { useNotify } from '../../composables/useNotify'
import { orderIds, sortByPosition, withPositions } from '../../utils/featured'

/** Rows tab (B-05): ordered table with drag-and-drop, inline activation, create/edit/delete. */
const props = defineProps<{
  seriesById: Record<string, AdminSeries>
  canEdit: boolean
}>()
const emit = defineEmits<{ resolved: [series: AdminSeries] }>()

const { t } = useI18n()
const api = useFeaturedApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-home-rows', () => api.listRows())
const rows = ref<HomeRow[]>(sortByPosition(data.value ?? []))
watch(data, (value) => {
  if (value) rows.value = sortByPosition(value)
})

const dialogVisible = ref(false)
const editing = ref<HomeRow | null>(null)
const busyId = ref<string | null>(null)
const reordering = ref(false)

const typeSeverity: Record<HomeRow['type'], string> = {
  MANUAL: 'info',
  TRENDING: 'warn',
  NEW: 'success',
  GENRE: 'secondary',
  CONTINUE_WATCHING: 'contrast',
}

function scope(row: HomeRow): string {
  if (row.type === 'GENRE') return row.genre ? t(`series.genres.${row.genre}`) : '—'
  if (row.type === 'MANUAL') {
    return row.seriesIds.map((id) => props.seriesById[id]?.title ?? id).join(', ')
  }
  return t(`featured.rows.typeHints.${row.type}`)
}

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: HomeRow): void {
  editing.value = row
  dialogVisible.value = true
}

function onSaved(saved: HomeRow): void {
  const exists = rows.value.some((row) => row.id === saved.id)
  rows.value = sortByPosition(
    exists ? rows.value.map((row) => (row.id === saved.id ? saved : row)) : [...rows.value, saved],
  )
}

async function toggleActive(row: HomeRow, isActive: boolean): Promise<void> {
  busyId.value = row.id
  try {
    onSaved(await api.updateRow(row.id, { isActive }))
    notify.success(t(isActive ? 'featured.toasts.activated' : 'featured.toasts.deactivated'))
  } catch (err) {
    notify.apiError(err, t('featured.toasts.saveFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(row: HomeRow): void {
  confirm.require({
    header: t('featured.rows.delete'),
    message: t('featured.rows.deleteConfirm', { title: row.titles.fr }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(row),
  })
}

async function remove(row: HomeRow): Promise<void> {
  busyId.value = row.id
  try {
    await api.deleteRow(row.id)
    rows.value = withPositions(rows.value.filter((item) => item.id !== row.id))
    notify.success(t('featured.toasts.rowDeleted'))
  } catch (err) {
    notify.apiError(err, t('featured.rows.delete'))
  } finally {
    busyId.value = null
  }
}

async function onRowReorder(event: { value: HomeRow[] }): Promise<void> {
  const previous = rows.value
  rows.value = withPositions(event.value)
  reordering.value = true
  try {
    rows.value = sortByPosition(await api.reorderRows(orderIds(event.value)))
    notify.success(t('featured.toasts.reordered'))
  } catch (err) {
    rows.value = previous
    notify.apiError(err, t('featured.actions.reorder'))
  } finally {
    reordering.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-muted-color">
        {{ t('featured.rows.summary', { count: rows.length }, rows.length) }}
      </p>
      <Button
        v-if="canEdit"
        :label="t('featured.rows.create')"
        icon="pi pi-plus"
        size="small"
        @click="openCreate"
      />
    </div>

    <Message v-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('featured.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <DataTable
      :value="rows"
      :loading="status === 'pending' && rows.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
      @row-reorder="onRowReorder"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-list text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('featured.rows.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('featured.rows.empty.hint') }}</p>
        </div>
      </template>

      <Column v-if="canEdit" row-reorder class="w-10" :reorderable-column="false" />
      <Column field="position" :header="t('featured.columns.position')" class="w-14 text-right">
        <template #body="{ data: row }: { data: HomeRow }">
          <span class="tabular-nums">{{ row.position }}</span>
        </template>
      </Column>
      <Column :header="t('featured.columns.title')">
        <template #body="{ data: row }: { data: HomeRow }">
          <p class="font-medium">{{ row.titles.fr }}</p>
          <p class="text-xs text-muted-color">
            <code>{{ row.key }}</code>
            <span v-if="row.titles.en"> · EN : {{ row.titles.en }}</span>
          </p>
        </template>
      </Column>
      <Column :header="t('featured.columns.type')" class="w-44">
        <template #body="{ data: row }: { data: HomeRow }">
          <Tag :value="t(`featured.rows.types.${row.type}`)" :severity="typeSeverity[row.type]" />
        </template>
      </Column>
      <Column :header="t('featured.columns.scope')">
        <template #body="{ data: row }: { data: HomeRow }">
          <span class="line-clamp-2 text-sm" :title="scope(row)">{{ scope(row) }}</span>
        </template>
      </Column>
      <Column :header="t('featured.columns.countries')" class="w-44">
        <template #body="{ data: row }: { data: HomeRow }">
          <div v-if="row.countries.length > 0" class="flex flex-wrap gap-1">
            <Tag
              v-for="code in row.countries"
              :key="code"
              :value="code"
              severity="secondary"
              class="font-mono"
            />
          </div>
          <span v-else class="text-sm text-muted-color">{{ t('featured.everywhere') }}</span>
        </template>
      </Column>
      <Column :header="t('featured.columns.active')" class="w-24">
        <template #body="{ data: row }: { data: HomeRow }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="!canEdit || busyId === row.id"
            :aria-label="t('featured.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: row }: { data: HomeRow }">
          <div v-if="canEdit" class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              size="small"
              text
              :aria-label="t('featured.actions.edit')"
              :title="t('featured.actions.edit')"
              @click="openEdit(row)"
            />
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :loading="busyId === row.id"
              :aria-label="t('featured.rows.delete')"
              :title="t('featured.rows.delete')"
              @click="askDelete(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <FeaturedRowDialog
      v-model:visible="dialogVisible"
      :row="editing"
      :series-by-id="seriesById"
      @saved="onSaved"
      @resolved="emit('resolved', $event)"
    />
  </div>
</template>
