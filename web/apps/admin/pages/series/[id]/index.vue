<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AdminSeries, AdminSeriesUpdateInput } from '#base/types/api'
import { ApiError } from '#base/utils/api-error'
import { canEditCatalogue } from '#base/utils/series-form'

const { t, d } = useI18n()
const route = useRoute()
const api = useCatalogueApi()
const notify = useNotify()
const confirm = useConfirm()
const auth = useAuthStore()

const seriesId = computed(() => String(route.params.id))

const {
  data: series,
  status,
  error,
  refresh,
} = await useAsyncData(
  () => `admin-series-${seriesId.value}`,
  () => api.getSeries(seriesId.value),
  { watch: [seriesId] },
)

const saving = ref(false)
const acting = ref<'publish' | 'archive' | null>(null)
const canAct = computed(() => canEditCatalogue(auth.user?.role))
const notFound = computed(() => ApiError.is(error.value) && error.value.status === 404)

async function onSubmit(input: AdminSeriesUpdateInput): Promise<void> {
  if (Object.keys(input).length === 0) {
    notify.info(t('series.toasts.nothingToSave'))
    return
  }
  saving.value = true
  try {
    series.value = await api.updateSeries(seriesId.value, input)
    notify.success(t('series.toasts.saved'))
  } catch (err) {
    notify.apiError(err, t('series.toasts.saveFailed'))
  } finally {
    saving.value = false
  }
}

function askPublish(): void {
  confirm.require({
    header: t('series.actions.publish'),
    message: t('series.actions.publishConfirm', { title: series.value?.title ?? '' }),
    icon: 'pi pi-globe',
    acceptLabel: t('series.actions.publish'),
    rejectLabel: t('common.cancel'),
    accept: () => void publish(),
  })
}

function askArchive(): void {
  confirm.require({
    header: t('series.actions.archive'),
    message: t('series.actions.archiveConfirm', { title: series.value?.title ?? '' }),
    icon: 'pi pi-inbox',
    acceptLabel: t('series.actions.archive'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void archive(),
  })
}

async function publish(): Promise<void> {
  acting.value = 'publish'
  try {
    series.value = await api.publishSeries(seriesId.value)
    notify.success(t('series.toasts.published'))
  } catch (err) {
    if (ApiError.is(err) && err.status === 409) {
      // Contract: publish is refused (409) when the series has no READY episode.
      notify.error(t('series.actions.publish'), t('series.actions.noReadyEpisode'))
    } else {
      notify.apiError(err, t('series.actions.publish'))
    }
  } finally {
    acting.value = null
  }
}

async function archive(): Promise<void> {
  acting.value = 'archive'
  try {
    series.value = await api.archiveSeries(seriesId.value)
    notify.success(t('series.toasts.archived'))
  } catch (err) {
    notify.apiError(err, t('series.actions.archive'))
  } finally {
    acting.value = null
  }
}

const current = computed<AdminSeries | null>(() => series.value ?? null)
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <LayoutPageHeader
      :title="current?.title ?? t('common.loading')"
      :subtitle="
        current
          ? `${current.slug} · ${t('series.form.updatedAt', { date: d(new Date(current.updatedAt), 'long') })}`
          : undefined
      "
      :crumbs="[{ label: current?.title ?? '…' }]"
    >
      <template #actions>
        <template v-if="current">
          <CatalogueSeriesStatusTag :status="current.status" class="mr-2" />
          <NuxtLink :to="`/series/${current.id}/episodes`">
            <Button
              icon="pi pi-video"
              :label="
                t('series.episodesWithCount', { count: current.episodeCount }, current.episodeCount)
              "
              severity="secondary"
              outlined
            />
          </NuxtLink>
          <Button
            v-if="canAct && current.status !== 'PUBLISHED'"
            icon="pi pi-globe"
            :label="t('series.actions.publish')"
            :loading="acting === 'publish'"
            :disabled="acting !== null"
            @click="askPublish"
          />
          <Button
            v-if="canAct && current.status !== 'ARCHIVED'"
            icon="pi pi-inbox"
            :label="t('series.actions.archive')"
            severity="danger"
            outlined
            :loading="acting === 'archive'"
            :disabled="acting !== null"
            @click="askArchive"
          />
        </template>
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
    <Message v-else-if="error" severity="error" :closable="false">
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('series.loadError') }}</span>
        <Button
          :label="t('common.retry')"
          size="small"
          severity="danger"
          outlined
          @click="refresh()"
        />
      </div>
    </Message>

    <div v-else-if="status === 'pending' && !current" class="flex flex-col gap-4">
      <Skeleton height="12rem" />
      <Skeleton height="8rem" />
    </div>

    <CatalogueSeriesForm v-else-if="current" :series="current" :saving="saving" @submit="onSubmit">
      <template #actions>
        <NuxtLink to="/series">
          <Button type="button" :label="t('common.back')" severity="secondary" text />
        </NuxtLink>
      </template>
    </CatalogueSeriesForm>
  </div>
</template>
