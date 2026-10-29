<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AdminEpisode, Subtitle } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { subtitleTracks, type SubtitleTrack } from '#base/utils/subtitles'
import { formatDuration } from '#base/utils/format'
import { createPoller, EPISODES_POLL_INTERVAL_MS, hasTranscodeInFlight } from '#base/utils/polling'
import { canEditCatalogue } from '#base/utils/series-form'
import { isPlannable } from '#base/utils/schedule'

const { t, locale } = useI18n()
const route = useRoute()
const api = useCatalogueApi()
const subtitlesApi = useSubtitlesApi()
const notify = useNotify()
const confirm = useConfirm()
const auth = useAuthStore()
const media = useMediaUrl()

const seriesId = computed(() => String(route.params.id))
const canEdit = computed(() => canEditCatalogue(auth.user?.role))

const { data: series, error: seriesError } = await useAsyncData(
  () => `admin-series-${seriesId.value}`,
  () => api.getSeries(seriesId.value),
)

const {
  data: loaded,
  status: loadStatus,
  error: episodesError,
  refresh: refreshEpisodes,
} = await useAsyncData(
  () => `admin-series-${seriesId.value}-episodes`,
  () => api.listEpisodes(seriesId.value),
)

const episodes = ref<AdminEpisode[]>(loaded.value ?? [])
watch(loaded, (value) => {
  if (value) episodes.value = value
})

// --- polling while a transcode is in flight (contract: every 5 s) ------------------------
const poller = createPoller({
  intervalMs: EPISODES_POLL_INTERVAL_MS,
  task: async () => {
    episodes.value = await api.listEpisodes(seriesId.value)
    return hasTranscodeInFlight(episodes.value)
  },
})
const polling = computed(() => hasTranscodeInFlight(episodes.value))
watch(
  polling,
  (active) => {
    if (active) poller.start()
    else poller.stop()
  },
  { immediate: true },
)
onBeforeUnmount(() => poller.stop())

// --- bulk upload ---------------------------------------------------------------------------
const queue = useEpisodeUploads(seriesId, {
  onItemDone: () => void refreshEpisodes(),
  onItemError: (item) => notify.error(t('episodes.toasts.uploadFailed', { name: item.file.name })),
})
const uploading = computed(() => queue.isBusy.value)

function onFiles(files: File[]): void {
  queue.add(files)
  notify.info(t('episodes.toasts.queued', { count: files.length }, files.length))
}

onBeforeRouteLeave(() => {
  if (!uploading.value) return true
  return window.confirm(t('episodes.queue.leaveWarning'))
})
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (uploading.value) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

// --- inline rename -------------------------------------------------------------------------
const editingId = ref<string | null>(null)
const editingTitle = ref('')
const renaming = ref(false)

function startRename(episode: AdminEpisode): void {
  editingId.value = episode.id
  editingTitle.value = episode.title
}
function cancelRename(): void {
  editingId.value = null
}
async function commitRename(episode: AdminEpisode): Promise<void> {
  const title = editingTitle.value.trim()
  if (!title || title === episode.title) {
    cancelRename()
    return
  }
  renaming.value = true
  try {
    const updated = await api.updateEpisode(episode.id, { title })
    replaceEpisode(updated)
    notify.success(t('episodes.toasts.renamed'))
    cancelRename()
  } catch (err) {
    notify.apiError(err, t('episodes.actions.rename'))
  } finally {
    renaming.value = false
  }
}

function replaceEpisode(updated: AdminEpisode): void {
  episodes.value = episodes.value.map((episode) => (episode.id === updated.id ? updated : episode))
}

// --- delete / retranscode / reorder --------------------------------------------------------
function askDelete(episode: AdminEpisode): void {
  confirm.require({
    header: t('episodes.actions.delete'),
    message: t('episodes.actions.deleteConfirm', { number: episode.number, title: episode.title }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(episode),
  })
}

async function remove(episode: AdminEpisode): Promise<void> {
  try {
    await api.deleteEpisode(episode.id)
    notify.success(t('episodes.toasts.deleted'))
    await refreshEpisodes()
  } catch (err) {
    notify.apiError(err, t('episodes.actions.delete'))
  }
}

async function retranscode(episode: AdminEpisode): Promise<void> {
  try {
    replaceEpisode(await api.retranscodeEpisode(episode.id))
    notify.success(t('episodes.toasts.retranscodeQueued'))
  } catch (err) {
    notify.apiError(err, t('episodes.actions.retranscode'))
  }
}

const reordering = ref(false)
async function onRowReorder(event: { value: AdminEpisode[] }): Promise<void> {
  const previous = episodes.value
  episodes.value = event.value.map((episode, index) => ({ ...episode, number: index + 1 }))
  reordering.value = true
  try {
    episodes.value = await api.reorderEpisodes(
      seriesId.value,
      event.value.map((episode) => episode.id),
    )
    notify.success(t('episodes.toasts.reordered'))
  } catch (err) {
    episodes.value = previous
    notify.apiError(err, t('episodes.actions.reorder'))
  } finally {
    reordering.value = false
  }
}

// --- subtitles (B-03) ----------------------------------------------------------------------
const subtitlesByEpisode = ref<Record<string, Subtitle[]>>({})
const subtitlesVisible = ref(false)
const subtitlesEpisode = ref<AdminEpisode | null>(null)

function openSubtitles(episode: AdminEpisode): void {
  subtitlesEpisode.value = episode
  subtitlesVisible.value = true
}

function onSubtitlesChanged(episodeId: string, subtitles: Subtitle[]): void {
  subtitlesByEpisode.value = { ...subtitlesByEpisode.value, [episodeId]: subtitles }
}

// --- scheduling (B-04) ---------------------------------------------------------------------
const publishDateVisible = ref(false)
const publishDateEpisode = ref<AdminEpisode | null>(null)
const planVisible = ref(false)
const plannableCount = computed(() => episodes.value.filter(isPlannable).length)

function openPublishDate(episode: AdminEpisode): void {
  publishDateEpisode.value = episode
  publishDateVisible.value = true
}

function onPlanDone(updated: AdminEpisode[]): void {
  for (const episode of updated) replaceEpisode(episode)
  void refreshEpisodes()
}

// --- preview -------------------------------------------------------------------------------
const previewVisible = ref(false)
const previewSrc = ref<string | null>(null)
const previewTitle = ref('')
const previewTracks = ref<SubtitleTrack[]>([])

async function preview(episode: AdminEpisode): Promise<void> {
  previewSrc.value = media.resolve(episode.hlsKey)
  previewTitle.value = `${episode.number}. ${episode.title}`
  previewTracks.value = subtitleTracks(
    subtitlesByEpisode.value[episode.id] ?? [],
    (url) => media.resolve(url),
    locale.value,
  )
  previewVisible.value = true
  // Side-load the subtitles of the episode so the editor can check their timing.
  try {
    const subtitles = await subtitlesApi.listSubtitles(episode.id)
    onSubtitlesChanged(episode.id, subtitles)
    if (previewVisible.value && previewTitle.value === `${episode.number}. ${episode.title}`) {
      previewTracks.value = subtitleTracks(subtitles, (url) => media.resolve(url), locale.value)
    }
  } catch (err) {
    notify.apiError(err, t('subtitles.loadError'))
  }
}

const notFound = computed(() => ApiError.is(seriesError.value) && seriesError.value.status === 404)
const readyCount = computed(
  () => episodes.value.filter((e) => e.transcodeStatus === 'READY').length,
)
</script>

<template>
  <div>
    <LayoutPageHeader
      :title="t('episodes.title')"
      :subtitle="
        series
          ? t('episodes.subtitle', {
              title: series.title,
              ready: readyCount,
              count: episodes.length,
            })
          : undefined
      "
      :crumbs="[
        { label: series?.title ?? '…', to: `/series/${seriesId}` },
        { label: t('episodes.title') },
      ]"
    >
      <template #actions>
        <Button
          v-if="canEdit"
          icon="pi pi-calendar-plus"
          :label="t('episodes.actions.plan')"
          severity="secondary"
          outlined
          :disabled="plannableCount === 0"
          data-testid="plan-release"
          @click="planVisible = true"
        />
        <NuxtLink :to="`/series/${seriesId}`">
          <Button icon="pi pi-pencil" :label="t('series.edit')" severity="secondary" outlined />
        </NuxtLink>
      </template>
    </LayoutPageHeader>

    <Message v-if="notFound" severity="warn" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('series.notFound') }}</span>
        <NuxtLink to="/series">
          <Button :label="t('module.backToCatalogue')" size="small" outlined />
        </NuxtLink>
      </div>
    </Message>

    <div v-else class="flex flex-col gap-6">
      <section v-if="canEdit" class="flex flex-col gap-4">
        <h2 class="text-lg font-semibold">{{ t('episodes.add') }}</h2>
        <EpisodesUploadDropZone @files="onFiles" />
        <EpisodesUploadQueuePanel :queue="queue" />
      </section>

      <Message v-if="episodesError" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('episodes.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="refreshEpisodes()"
          />
        </div>
      </Message>

      <Message v-if="polling" severity="info" :closable="false" icon="pi pi-spin pi-spinner">
        {{ t('episodes.polling') }}
      </Message>

      <DataTable
        :value="episodes"
        :loading="loadStatus === 'pending' && episodes.length === 0"
        data-key="id"
        striped-rows
        :row-hover="true"
        class="rounded-lg border border-surface-200 bg-surface-0"
        @row-reorder="onRowReorder"
      >
        <template #header>
          <div class="flex items-center justify-between text-sm text-muted-color">
            <span>{{ t('episodes.count', { count: episodes.length }, episodes.length) }}</span>
            <span v-if="canEdit && episodes.length > 1" class="hidden sm:inline">
              <i class="pi pi-arrows-v mr-1" aria-hidden="true" />{{
                t('episodes.actions.reorderHint')
              }}
            </span>
          </div>
        </template>
        <template #empty>
          <div class="py-12 text-center">
            <i class="pi pi-video text-3xl text-muted-color" aria-hidden="true" />
            <p class="mt-3 font-medium">{{ t('episodes.empty.title') }}</p>
            <p class="mt-1 text-sm text-muted-color">{{ t('episodes.empty.hint') }}</p>
          </div>
        </template>

        <Column v-if="canEdit" row-reorder class="w-10" :reorderable-column="false" />

        <Column field="number" :header="t('episodes.columns.number')" class="w-16 text-right">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <span class="tabular-nums font-medium">{{ row.number }}</span>
          </template>
        </Column>

        <Column :header="t('episodes.columns.thumbnail')" class="w-20">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <div class="h-16 w-10 overflow-hidden rounded bg-surface-200">
              <img
                v-if="row.thumbnailUrl"
                :src="media.resolve(row.thumbnailUrl) ?? undefined"
                alt=""
                class="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </template>
        </Column>

        <Column :header="t('episodes.columns.title')">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <div v-if="editingId === row.id" class="flex items-center gap-1">
              <InputText
                v-model="editingTitle"
                size="small"
                fluid
                autofocus
                :disabled="renaming"
                :aria-label="t('episodes.actions.rename')"
                @keydown.enter.prevent="commitRename(row)"
                @keydown.esc.prevent="cancelRename"
              />
              <Button
                icon="pi pi-check"
                size="small"
                text
                :loading="renaming"
                :aria-label="t('common.save')"
                @click="commitRename(row)"
              />
              <Button
                icon="pi pi-times"
                size="small"
                text
                severity="secondary"
                :aria-label="t('common.cancel')"
                @click="cancelRename"
              />
            </div>
            <div v-else class="group flex items-center gap-2">
              <span class="truncate">{{ row.title }}</span>
              <Button
                v-if="canEdit"
                icon="pi pi-pencil"
                size="small"
                text
                severity="secondary"
                class="opacity-0 group-hover:opacity-100 focus:opacity-100"
                :aria-label="t('episodes.actions.rename')"
                :title="t('episodes.actions.rename')"
                @click="startRename(row)"
              />
            </div>
            <p
              v-if="row.transcodeStatus === 'FAILED' && row.transcodeError"
              class="mt-1 truncate text-xs text-red-600"
              :title="row.transcodeError"
            >
              {{ row.transcodeError }}
            </p>
          </template>
        </Column>

        <Column :header="t('episodes.columns.status')" class="w-40">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <EpisodesEpisodeStatusTag :status="row.transcodeStatus" :error="row.transcodeError" />
          </template>
        </Column>

        <Column :header="t('episodes.columns.duration')" class="w-24 text-right">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <span class="tabular-nums">{{ formatDuration(row.durationSeconds) }}</span>
          </template>
        </Column>

        <Column :header="t('episodes.columns.publishedAt')" class="w-52">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <div class="group flex items-center gap-1">
              <EpisodesPublicationTag :published-at="row.publishedAt" />
              <Button
                v-if="canEdit"
                icon="pi pi-calendar"
                size="small"
                text
                severity="secondary"
                class="opacity-0 group-hover:opacity-100 focus:opacity-100"
                :aria-label="t('episodes.actions.schedule')"
                :title="t('episodes.actions.schedule')"
                data-testid="schedule-button"
                @click="openPublishDate(row)"
              />
            </div>
          </template>
        </Column>

        <Column class="w-44">
          <template #body="{ data: row }: { data: AdminEpisode }">
            <div class="flex justify-end gap-1">
              <Button
                v-if="row.transcodeStatus === 'READY' && row.hlsKey"
                icon="pi pi-play"
                size="small"
                text
                :aria-label="t('episodes.actions.preview')"
                :title="t('episodes.actions.preview')"
                @click="preview(row)"
              />
              <Button
                v-if="row.transcodeStatus === 'READY'"
                icon="pi pi-language"
                size="small"
                text
                :aria-label="t('subtitles.title')"
                :title="t('subtitles.title')"
                data-testid="subtitles-button"
                @click="openSubtitles(row)"
              />
              <Button
                v-if="canEdit && row.transcodeStatus === 'FAILED'"
                icon="pi pi-refresh"
                size="small"
                text
                severity="warn"
                :aria-label="t('episodes.actions.retranscode')"
                :title="t('episodes.actions.retranscode')"
                @click="retranscode(row)"
              />
              <Button
                v-if="canEdit"
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                :aria-label="t('episodes.actions.delete')"
                :title="t('episodes.actions.delete')"
                @click="askDelete(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <EpisodesHlsPlayerDialog
      v-model:visible="previewVisible"
      :src="previewSrc"
      :title="previewTitle"
      :tracks="previewTracks"
    />

    <EpisodesSubtitlesPanel
      v-model:visible="subtitlesVisible"
      :episode="subtitlesEpisode"
      :can-edit="canEdit"
      @changed="onSubtitlesChanged"
    />

    <EpisodesPublishDateDialog
      v-model:visible="publishDateVisible"
      :episode="publishDateEpisode"
      @saved="replaceEpisode"
    />

    <EpisodesDailyReleaseDialog
      v-model:visible="planVisible"
      :episodes="episodes"
      @done="onPlanDone"
    />
  </div>
</template>
