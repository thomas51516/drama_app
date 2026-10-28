<script setup lang="ts">
import { computed } from 'vue'
import type { UploadItem, UploadQueue } from '../../utils/upload-queue'
import { formatBytes } from '../../utils/format'

/** Global and per-file progress of the bulk upload, with retry / cancel / remove actions. */
const props = defineProps<{ queue: UploadQueue }>()

const { t } = useI18n()
const progress = computed(() => props.queue.progress.value)
const busy = computed(() => props.queue.isBusy.value)
const items = computed(() => props.queue.items)

function percent(item: UploadItem): number {
  if (item.status === 'done') return 100
  return item.total ? Math.round((item.loaded / item.total) * 100) : 0
}

const severity: Record<UploadItem['status'], 'secondary' | 'info' | 'success' | 'danger' | 'warn'> =
  {
    queued: 'secondary',
    preparing: 'info',
    uploading: 'info',
    finalizing: 'info',
    done: 'success',
    error: 'danger',
    cancelled: 'warn',
  }

const canCancel = (item: UploadItem): boolean =>
  ['queued', 'preparing', 'uploading', 'finalizing'].includes(item.status)
const canRetry = (item: UploadItem): boolean =>
  item.status === 'error' || item.status === 'cancelled'
const canRemove = (item: UploadItem): boolean => !canCancel(item)
</script>

<template>
  <section
    v-if="items.length > 0"
    class="rounded-lg border border-surface-200 bg-surface-0"
    :aria-label="t('episodes.queue.title')"
  >
    <header class="flex flex-wrap items-center gap-3 border-b border-surface-200 px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">{{ t('episodes.queue.title') }}</span>
          <span class="text-muted-color">
            {{
              t('episodes.queue.summary', {
                done: progress.done,
                count: progress.count,
                percent: progress.percent,
              })
            }}
          </span>
        </div>
        <ProgressBar :value="progress.percent" class="mt-2 !h-2" :show-value="false" />
      </div>
      <div class="flex items-center gap-1">
        <Button
          v-if="progress.failed > 0"
          :label="t('episodes.queue.retryAll')"
          icon="pi pi-refresh"
          size="small"
          outlined
          @click="queue.retryFailed()"
        />
        <Button
          v-if="busy"
          :label="t('episodes.queue.cancelAll')"
          icon="pi pi-times"
          size="small"
          severity="danger"
          text
          @click="queue.cancelAll()"
        />
        <Button
          v-else
          :label="t('episodes.queue.clear')"
          icon="pi pi-eraser"
          size="small"
          severity="secondary"
          text
          @click="queue.clearFinished()"
        />
      </div>
    </header>

    <ul class="divide-y divide-surface-200">
      <li v-for="item in items" :key="item.id" class="flex items-center gap-3 px-4 py-2 text-sm">
        <i class="pi pi-video text-muted-color" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="truncate font-medium" :title="item.file.name">{{ item.title }}</span>
            <Tag
              :value="t(`episodes.queue.states.${item.status}`)"
              :severity="severity[item.status]"
              class="shrink-0"
            />
          </div>
          <div class="mt-1 flex items-center gap-2 text-xs text-muted-color">
            <ProgressBar
              :value="percent(item)"
              :mode="
                item.status === 'preparing' || item.status === 'finalizing'
                  ? 'indeterminate'
                  : 'determinate'
              "
              class="!h-1.5 flex-1"
              :show-value="false"
            />
            <span class="w-28 shrink-0 text-right tabular-nums">
              {{ formatBytes(item.loaded) }} / {{ formatBytes(item.total) }}
            </span>
          </div>
          <p v-if="item.error" class="mt-1 truncate text-xs text-red-600" :title="item.error">
            {{ item.error }}
          </p>
        </div>
        <div class="flex shrink-0 items-center">
          <Button
            v-if="canRetry(item)"
            icon="pi pi-refresh"
            size="small"
            text
            :aria-label="t('common.retry')"
            :title="t('common.retry')"
            @click="queue.retry(item.id)"
          />
          <Button
            v-if="canCancel(item)"
            icon="pi pi-times"
            size="small"
            text
            severity="danger"
            :aria-label="t('common.cancel')"
            :title="t('common.cancel')"
            @click="queue.cancel(item.id)"
          />
          <Button
            v-if="canRemove(item)"
            icon="pi pi-trash"
            size="small"
            text
            severity="secondary"
            :aria-label="t('common.remove')"
            :title="t('common.remove')"
            @click="queue.remove(item.id)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>
