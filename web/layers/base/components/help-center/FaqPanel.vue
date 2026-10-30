<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FaqEntry } from '../../types/api'
import { useHelpCenterApi } from '../../composables/useHelpCenterApi'
import { useNotify } from '../../composables/useNotify'
import {
  FAQ_CATEGORIES,
  applyFaqOrder,
  groupFaqByCategory,
  reorderWithinCategory,
  sortFaqEntries,
  translatedLanguages,
} from '../../utils/help-center'

/** FAQ tab (B-03bis): entries grouped by category with drag-and-drop, publish toggle, preview. */
const { t } = useI18n()
const api = useHelpCenterApi()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-faq', () => api.listFaq())
const entries = ref<FaqEntry[]>(sortFaqEntries(data.value ?? []))
watch(data, (value) => {
  if (value) entries.value = sortFaqEntries(value)
})

const groups = computed(() => groupFaqByCategory(entries.value))
const publishedCount = computed(() => entries.value.filter((entry) => entry.isPublished).length)

const dialogVisible = ref(false)
const editing = ref<FaqEntry | null>(null)
const dialogCategory = ref<string>(FAQ_CATEGORIES[0])
const busyId = ref<string | null>(null)
const reordering = ref(false)

function categoryTitle(key: string): string {
  return (FAQ_CATEGORIES as readonly string[]).includes(key)
    ? t(`helpCenter.faq.categories.${key}`)
    : key
}

function openCreate(category: string = FAQ_CATEGORIES[0]): void {
  editing.value = null
  dialogCategory.value = category
  dialogVisible.value = true
}

function openEdit(entry: FaqEntry): void {
  editing.value = entry
  dialogVisible.value = true
}

function upsert(saved: FaqEntry): void {
  const exists = entries.value.some((entry) => entry.id === saved.id)
  entries.value = sortFaqEntries(
    exists
      ? entries.value.map((entry) => (entry.id === saved.id ? saved : entry))
      : [...entries.value, saved],
  )
}

async function togglePublished(entry: FaqEntry, isPublished: boolean): Promise<void> {
  busyId.value = entry.id
  try {
    upsert(await api.updateFaq(entry.id, { isPublished }))
    notify.success(
      t(isPublished ? 'helpCenter.faq.toasts.published' : 'helpCenter.faq.toasts.unpublished'),
    )
  } catch (err) {
    notify.apiError(err, t('helpCenter.faq.toasts.saveFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(entry: FaqEntry): void {
  confirm.require({
    header: t('helpCenter.faq.delete'),
    message: t('helpCenter.faq.deleteConfirm', { question: entry.question.fr }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(entry),
  })
}

async function remove(entry: FaqEntry): Promise<void> {
  busyId.value = entry.id
  try {
    await api.deleteFaq(entry.id)
    entries.value = entries.value
      .filter((item) => item.id !== entry.id)
      .map((item, index) => ({ ...item, position: index + 1 }))
    notify.success(t('helpCenter.faq.toasts.deleted'))
  } catch (err) {
    notify.apiError(err, t('helpCenter.faq.delete'))
  } finally {
    busyId.value = null
  }
}

async function onRowReorder(category: string, event: { value: FaqEntry[] }): Promise<void> {
  const previous = entries.value
  const ids = reorderWithinCategory(
    entries.value,
    category,
    event.value.map((entry) => entry.id),
  )
  entries.value = applyFaqOrder(entries.value, ids)
  reordering.value = true
  try {
    entries.value = sortFaqEntries(await api.reorderFaq(ids))
    notify.success(t('helpCenter.faq.toasts.reordered'))
  } catch (err) {
    entries.value = previous
    notify.apiError(err, t('helpCenter.faq.toasts.saveFailed'))
  } finally {
    reordering.value = false
  }
}
</script>

<template>
  <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted-color">
          {{ t('helpCenter.faq.summary', { count: entries.length }, entries.length) }} ·
          {{ t('helpCenter.faq.published', { count: publishedCount }, publishedCount) }}
        </p>
        <Button
          :label="t('helpCenter.faq.create')"
          icon="pi pi-plus"
          size="small"
          @click="openCreate()"
        />
      </div>

      <Message v-if="error" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('helpCenter.faq.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="refresh()"
          />
        </div>
      </Message>

      <div
        v-if="status !== 'pending' && entries.length === 0 && !error"
        class="rounded-lg border border-dashed border-surface-300 bg-surface-0 py-12 text-center"
      >
        <i class="pi pi-question-circle text-3xl text-muted-color" aria-hidden="true" />
        <p class="mt-3 font-medium">{{ t('helpCenter.faq.empty.title') }}</p>
        <p class="mt-1 text-sm text-muted-color">{{ t('helpCenter.faq.empty.hint') }}</p>
      </div>

      <section
        v-for="group in groups"
        :key="group.key"
        class="rounded-lg border border-surface-200 bg-surface-0"
        :data-testid="`faq-category-${group.key}`"
      >
        <header
          class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-200 px-4 py-3"
        >
          <h3 class="font-semibold">{{ categoryTitle(group.key) }}</h3>
          <Button
            :label="t('helpCenter.faq.create')"
            icon="pi pi-plus"
            size="small"
            text
            @click="openCreate(group.key)"
          />
        </header>
        <DataTable
          :value="group.entries"
          data-key="id"
          :loading="reordering"
          @row-reorder="onRowReorder(group.key, $event)"
        >
          <template #empty>
            <p class="py-4 text-center text-sm text-muted-color">
              {{ t('helpCenter.faq.emptyCategory') }}
            </p>
          </template>
          <Column row-reorder class="w-10" :reorderable-column="false" />
          <Column :header="t('helpCenter.faq.columns.question')">
            <template #body="{ data: entry }: { data: FaqEntry }">
              <p class="font-medium">{{ entry.question.fr }}</p>
              <p class="line-clamp-1 text-xs text-muted-color">{{ entry.answer.fr }}</p>
            </template>
          </Column>
          <Column :header="t('helpCenter.faq.columns.languages')" class="w-36">
            <template #body="{ data: entry }: { data: FaqEntry }">
              <div class="flex gap-1">
                <Tag
                  v-for="lang in translatedLanguages(entry)"
                  :key="lang"
                  :value="lang.toUpperCase()"
                  severity="secondary"
                  class="font-mono text-[10px]"
                />
              </div>
            </template>
          </Column>
          <Column :header="t('helpCenter.faq.columns.published')" class="w-24">
            <template #body="{ data: entry }: { data: FaqEntry }">
              <ToggleSwitch
                :model-value="entry.isPublished"
                :disabled="busyId === entry.id"
                :aria-label="t('helpCenter.faq.form.published')"
                @update:model-value="togglePublished(entry, $event)"
              />
            </template>
          </Column>
          <Column class="w-24">
            <template #body="{ data: entry }: { data: FaqEntry }">
              <div class="flex justify-end gap-1">
                <Button
                  icon="pi pi-pencil"
                  size="small"
                  text
                  :aria-label="t('helpCenter.faq.edit')"
                  :title="t('helpCenter.faq.edit')"
                  @click="openEdit(entry)"
                />
                <Button
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  :loading="busyId === entry.id"
                  :aria-label="t('helpCenter.faq.delete')"
                  :title="t('helpCenter.faq.delete')"
                  @click="askDelete(entry)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </section>
      <p v-if="entries.length > 0" class="text-xs text-muted-color">
        {{ t('helpCenter.faq.reorderHint') }}
      </p>
    </div>

    <HelpCenterFaqPreview :entries="entries" />

    <HelpCenterFaqEntryDialog
      v-model:visible="dialogVisible"
      :entry="editing"
      :category="dialogCategory"
      @saved="upsert"
    />
  </div>
</template>
