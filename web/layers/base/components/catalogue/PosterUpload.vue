<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  POSTER_ACCEPTED_TYPES,
  POSTER_MAX_BYTES,
  usePosterUpload,
} from '../../composables/usePosterUpload'
import { useMediaUrl } from '../../composables/useMediaUrl'
import { useNotify } from '../../composables/useNotify'
import { formatBytes } from '../../utils/format'

/**
 * Poster picker: presign → PUT to storage → emits the public URL. Shows the local preview
 * immediately, then the stored URL once saved.
 */
const props = defineProps<{
  modelValue: string | null
  /** 2:3 vertical poster or 16:9 horizontal poster. */
  orientation: 'vertical' | 'horizontal'
  label: string
  disabled?: boolean
  inputId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const { t } = useI18n()
const notify = useNotify()
const poster = usePosterUpload()
const media = useMediaUrl()

const input = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const percent = ref(0)
const localPreview = ref<string | null>(null)
const broken = ref(false)

const previewUrl = computed(() => localPreview.value ?? media.resolve(props.modelValue))
const aspectClass = computed(() =>
  props.orientation === 'vertical' ? 'aspect-[2/3] w-40' : 'aspect-video w-72',
)

watch(
  () => props.modelValue,
  () => {
    broken.value = false
  },
)

function openPicker(): void {
  input.value?.click()
}

async function onFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  const problem = poster.validate(file)
  if (problem === 'type') {
    notify.warn(t('series.poster.invalidType'))
    return
  }
  if (problem === 'size') {
    notify.warn(t('series.poster.tooLarge', { max: formatBytes(POSTER_MAX_BYTES) }))
    return
  }

  if (localPreview.value) URL.revokeObjectURL(localPreview.value)
  localPreview.value = URL.createObjectURL(file)
  uploading.value = true
  percent.value = 0
  try {
    const publicUrl = await poster.upload(file, {
      onProgress: (loaded, total) => {
        percent.value = total ? Math.round((loaded / total) * 100) : 0
      },
    })
    emit('update:modelValue', publicUrl)
    notify.success(t('series.poster.uploaded'))
  } catch (error) {
    URL.revokeObjectURL(localPreview.value)
    localPreview.value = null
    notify.apiError(error, t('series.poster.error'))
  } finally {
    uploading.value = false
  }
}

function remove(): void {
  if (localPreview.value) URL.revokeObjectURL(localPreview.value)
  localPreview.value = null
  emit('update:modelValue', null)
}

onBeforeUnmount(() => {
  if (localPreview.value) URL.revokeObjectURL(localPreview.value)
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <span class="text-sm font-medium">{{ label }}</span>
    <div class="flex flex-wrap items-start gap-4">
      <div
        class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-surface-300 bg-surface-100"
        :class="aspectClass"
      >
        <img
          v-if="previewUrl && !broken"
          :src="previewUrl"
          :alt="label"
          class="h-full w-full object-cover"
          @error="broken = true"
        />
        <span v-else class="px-3 text-center text-xs text-muted-color">
          <i class="pi pi-image block text-2xl" aria-hidden="true" />
          {{ broken ? t('series.poster.unavailable') : t('series.poster.empty') }}
        </span>
        <ProgressBar
          v-if="uploading"
          :value="percent"
          class="absolute inset-x-2 bottom-2 !h-2"
          :show-value="false"
        />
      </div>

      <div class="flex flex-col gap-2 text-sm">
        <input
          :id="inputId"
          ref="input"
          type="file"
          class="sr-only"
          :accept="POSTER_ACCEPTED_TYPES.join(',')"
          :disabled="disabled || uploading"
          @change="onFileSelected"
        />
        <Button
          type="button"
          :label="modelValue ? t('series.poster.replace') : t('series.poster.choose')"
          icon="pi pi-upload"
          size="small"
          outlined
          :loading="uploading"
          :disabled="disabled"
          @click="openPicker"
        />
        <Button
          v-if="modelValue"
          type="button"
          :label="t('common.remove')"
          icon="pi pi-trash"
          size="small"
          text
          severity="danger"
          :disabled="disabled || uploading"
          @click="remove"
        />
        <p class="max-w-xs text-xs text-muted-color">
          {{
            t('series.poster.hint', {
              ratio: orientation === 'vertical' ? '2:3' : '16:9',
              max: formatBytes(POSTER_MAX_BYTES),
            })
          }}
        </p>
      </div>
    </div>
  </div>
</template>
