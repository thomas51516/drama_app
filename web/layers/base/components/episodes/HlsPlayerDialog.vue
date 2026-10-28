<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type Hls from 'hls.js'

/**
 * Preview of a READY episode: hls.js (MSE) when supported, native HLS otherwise (Safari).
 * hls.js is loaded lazily so the admin bundle only pays for it on first preview.
 */
const props = defineProps<{
  visible: boolean
  src: string | null
  title?: string
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { t } = useI18n()
const video = ref<HTMLVideoElement | null>(null)
const error = ref<string | null>(null)
let hls: Hls | null = null

function destroy(): void {
  hls?.destroy()
  hls = null
  if (video.value) {
    video.value.pause()
    video.value.removeAttribute('src')
    video.value.load()
  }
}

async function attach(): Promise<void> {
  error.value = null
  const element = video.value
  if (!element || !props.src) return
  const { default: HlsPlayer } = await import('hls.js')
  if (HlsPlayer.isSupported()) {
    hls = new HlsPlayer({ enableWorker: true })
    hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
      if (data.fatal) error.value = `${data.type}: ${data.details}`
    })
    hls.loadSource(props.src)
    hls.attachMedia(element)
  } else if (element.canPlayType('application/vnd.apple.mpegurl')) {
    element.src = props.src
  } else {
    error.value = t('episodes.preview.unsupported')
  }
}

watch(
  () => [props.visible, props.src] as const,
  async ([visible]) => {
    destroy()
    if (visible) {
      await nextTick()
      await attach()
    }
  },
)

onBeforeUnmount(destroy)
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    :header="title ?? t('episodes.preview.title')"
    :style="{ width: 'min(28rem, 95vw)' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-3">
      <div class="mx-auto aspect-[9/16] w-full max-h-[70vh] overflow-hidden rounded-md bg-black">
        <video
          ref="video"
          class="h-full w-full"
          controls
          playsinline
          autoplay
          :aria-label="title ?? t('episodes.preview.title')"
        />
      </div>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <p v-if="src" class="truncate text-xs text-muted-color" :title="src">{{ src }}</p>
    </div>
  </Dialog>
</template>
