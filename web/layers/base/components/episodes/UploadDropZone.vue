<script setup lang="ts">
import { ref } from 'vue'
import { EPISODE_MAX_FILE_BYTES } from '../../types/api'
import { EPISODE_FILE_INPUT_ACCEPT, selectEpisodeFiles } from '../../utils/episode-files'
import { formatBytes } from '../../utils/format'
import { useNotify } from '../../composables/useNotify'

/** Multi-file drop zone for episode masters (mp4/mov, single PUT, 2 GB cap). */
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()

const { t } = useI18n()
const notify = useNotify()
const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

function handle(files: Iterable<File>): void {
  const { accepted, rejected } = selectEpisodeFiles(files)
  for (const { file, reason } of rejected) {
    notify.warn(
      t('episodes.dropzone.rejectedTitle'),
      t(`episodes.dropzone.rejected.${reason}`, { name: file.name }),
    )
  }
  if (accepted.length > 0) emit('files', accepted)
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  if (props.disabled) return
  handle(Array.from(event.dataTransfer?.files ?? []))
}

function onChange(event: Event): void {
  const target = event.target as HTMLInputElement
  handle(Array.from(target.files ?? []))
  target.value = ''
}
</script>

<template>
  <div
    class="rounded-lg border-2 border-dashed p-6 text-center transition-colors"
    :class="[
      dragging ? 'border-primary bg-primary-50' : 'border-surface-300 bg-surface-0',
      disabled ? 'opacity-60' : '',
    ]"
    role="button"
    tabindex="0"
    :aria-disabled="disabled"
    @dragenter.prevent="dragging = !disabled"
    @dragover.prevent="dragging = !disabled"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
    @click="!disabled && input?.click()"
    @keydown.enter.prevent="!disabled && input?.click()"
    @keydown.space.prevent="!disabled && input?.click()"
  >
    <input
      ref="input"
      type="file"
      class="sr-only"
      multiple
      :accept="EPISODE_FILE_INPUT_ACCEPT"
      :disabled="disabled"
      tabindex="-1"
      @change="onChange"
    />
    <i class="pi pi-cloud-upload text-3xl text-primary" aria-hidden="true" />
    <p class="mt-2 font-medium">{{ t('episodes.dropzone.title') }}</p>
    <p class="mt-1 text-sm text-muted-color">{{ t('episodes.dropzone.hint') }}</p>
    <p class="mt-2 text-xs text-muted-color">
      {{ t('episodes.dropzone.limits', { max: formatBytes(EPISODE_MAX_FILE_BYTES) }) }}
    </p>
  </div>
</template>
