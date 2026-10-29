<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminSeries, HomeBanner } from '../../types/api'
import { useFeaturedApi } from '../../composables/useFeaturedApi'
import { useMediaUrl } from '../../composables/useMediaUrl'
import { useNotify } from '../../composables/useNotify'
import { bannerSchedule, orderIds, sortByPosition, withPositions } from '../../utils/featured'

/** Banners tab (B-05): ordered table with drag-and-drop, inline activation, create/edit/delete. */
const props = defineProps<{
  seriesById: Record<string, AdminSeries>
  canEdit: boolean
}>()
const emit = defineEmits<{ resolved: [series: AdminSeries] }>()

const { t, d } = useI18n()
const api = useFeaturedApi()
const media = useMediaUrl()
const notify = useNotify()
const confirm = useConfirm()

const { data, status, error, refresh } = useAsyncData('admin-home-banners', () => api.listBanners())
const banners = ref<HomeBanner[]>(sortByPosition(data.value ?? []))
watch(data, (value) => {
  if (value) banners.value = sortByPosition(value)
})

const dialogVisible = ref(false)
const editing = ref<HomeBanner | null>(null)
const busyId = ref<string | null>(null)
const reordering = ref(false)

const scheduleSeverity: Record<ReturnType<typeof bannerSchedule>, string> = {
  live: 'success',
  scheduled: 'info',
  expired: 'warn',
  inactive: 'secondary',
}

const activeCount = computed(
  () => banners.value.filter((banner) => bannerSchedule(banner) === 'live').length,
)

function seriesTitle(id: string): string {
  return props.seriesById[id]?.title ?? id
}

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(banner: HomeBanner): void {
  editing.value = banner
  dialogVisible.value = true
}

function onSaved(saved: HomeBanner): void {
  const exists = banners.value.some((banner) => banner.id === saved.id)
  banners.value = sortByPosition(
    exists
      ? banners.value.map((banner) => (banner.id === saved.id ? saved : banner))
      : [...banners.value, saved],
  )
}

async function toggleActive(banner: HomeBanner, isActive: boolean): Promise<void> {
  busyId.value = banner.id
  try {
    onSaved(await api.updateBanner(banner.id, { isActive }))
    notify.success(t(isActive ? 'featured.toasts.activated' : 'featured.toasts.deactivated'))
  } catch (err) {
    notify.apiError(err, t('featured.toasts.saveFailed'))
  } finally {
    busyId.value = null
  }
}

function askDelete(banner: HomeBanner): void {
  confirm.require({
    header: t('featured.banners.delete'),
    message: t('featured.banners.deleteConfirm', { title: banner.title }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(banner),
  })
}

async function remove(banner: HomeBanner): Promise<void> {
  busyId.value = banner.id
  try {
    await api.deleteBanner(banner.id)
    banners.value = withPositions(banners.value.filter((item) => item.id !== banner.id))
    notify.success(t('featured.toasts.bannerDeleted'))
  } catch (err) {
    notify.apiError(err, t('featured.banners.delete'))
  } finally {
    busyId.value = null
  }
}

async function onRowReorder(event: { value: HomeBanner[] }): Promise<void> {
  const previous = banners.value
  banners.value = withPositions(event.value)
  reordering.value = true
  try {
    banners.value = sortByPosition(await api.reorderBanners(orderIds(event.value)))
    notify.success(t('featured.toasts.reordered'))
  } catch (err) {
    banners.value = previous
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
        {{
          t(
            'featured.banners.summary',
            { count: banners.length, live: activeCount },
            banners.length,
          )
        }}
      </p>
      <Button
        v-if="canEdit"
        :label="t('featured.banners.create')"
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
      :value="banners"
      :loading="status === 'pending' && banners.length === 0"
      data-key="id"
      striped-rows
      class="rounded-lg border border-surface-200 bg-surface-0"
      @row-reorder="onRowReorder"
    >
      <template #empty>
        <div class="py-12 text-center">
          <i class="pi pi-image text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-3 font-medium">{{ t('featured.banners.empty.title') }}</p>
          <p class="mt-1 text-sm text-muted-color">{{ t('featured.banners.empty.hint') }}</p>
        </div>
      </template>

      <Column v-if="canEdit" row-reorder class="w-10" :reorderable-column="false" />
      <Column field="position" :header="t('featured.columns.position')" class="w-14 text-right">
        <template #body="{ data: row }: { data: HomeBanner }">
          <span class="tabular-nums">{{ row.position }}</span>
        </template>
      </Column>
      <Column :header="t('featured.columns.image')" class="w-32">
        <template #body="{ data: row }: { data: HomeBanner }">
          <div class="aspect-video w-28 overflow-hidden rounded bg-surface-200">
            <img
              v-if="media.resolve(row.imageUrl)"
              :src="media.resolve(row.imageUrl) ?? undefined"
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        </template>
      </Column>
      <Column :header="t('featured.columns.title')">
        <template #body="{ data: row }: { data: HomeBanner }">
          <p class="font-medium">{{ row.title }}</p>
          <p v-if="row.subtitle" class="text-sm text-muted-color">{{ row.subtitle }}</p>
          <p class="mt-1 text-xs text-muted-color">
            <i class="pi pi-book mr-1" aria-hidden="true" />{{ seriesTitle(row.seriesId) }}
          </p>
        </template>
      </Column>
      <Column :header="t('featured.columns.countries')" class="w-44">
        <template #body="{ data: row }: { data: HomeBanner }">
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
      <Column :header="t('featured.columns.schedule')" class="w-48">
        <template #body="{ data: row }: { data: HomeBanner }">
          <Tag
            :value="t(`featured.schedule.${bannerSchedule(row)}`)"
            :severity="scheduleSeverity[bannerSchedule(row)]"
          />
          <p v-if="row.startsAt || row.endsAt" class="mt-1 text-xs text-muted-color">
            {{ row.startsAt ? d(new Date(row.startsAt), 'short') : '…' }} →
            {{ row.endsAt ? d(new Date(row.endsAt), 'short') : '…' }}
          </p>
        </template>
      </Column>
      <Column :header="t('featured.columns.active')" class="w-24">
        <template #body="{ data: row }: { data: HomeBanner }">
          <ToggleSwitch
            :model-value="row.isActive"
            :disabled="!canEdit || busyId === row.id"
            :aria-label="t('featured.form.active')"
            @update:model-value="toggleActive(row, $event)"
          />
        </template>
      </Column>
      <Column class="w-28">
        <template #body="{ data: row }: { data: HomeBanner }">
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
              :aria-label="t('featured.banners.delete')"
              :title="t('featured.banners.delete')"
              @click="askDelete(row)"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <FeaturedBannerDialog
      v-model:visible="dialogVisible"
      :banner="editing"
      :series-by-id="seriesById"
      @saved="onSaved"
      @resolved="emit('resolved', $event)"
    />
  </div>
</template>
