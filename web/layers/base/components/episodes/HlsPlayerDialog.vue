<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type Hls from 'hls.js'
import type { SubtitleTrack } from '../../utils/subtitles'
import { defaultTrackIndex } from '../../utils/subtitles'

/**
 * Preview of a READY episode: hls.js (MSE) when supported, native HLS otherwise (Safari).
 * hls.js is loaded lazily so the admin bundle only pays for it on first preview.
 * Subtitles (B-03) are side-loaded as `<track>` elements so the editor can check the timing;
 * the selector switches the shown track (or none).
 */
const props = defineProps<{
  visible: boolean
  src: string | null
  title?: string
  tracks?: SubtitleTrack[]
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const { t, locale } = useI18n()
const video = ref<HTMLVideoElement | null>(null)
const error = ref<string | null>(null)
let hls: Hls | null = null

const NONE = -1
const tracks = computed(() => props.tracks ?? [])
const selectedTrack = ref<number>(NONE)
const trackOptions = computed(() => [
  { value: NONE, label: t('episodes.preview.noSubtitles') },
  ...tracks.value.map((track, index) => ({
    value: index,
    label: `${track.label} (${track.language})`,
  })),
])

/** Show the selected `<track>` and disable the others (text tracks are matched by element). */
function applyTrackSelection(): void {
  const element = video.value
  if (!element) return
  element.querySelectorAll('track').forEach((trackElement, index) => {
    const mode = index === selectedTrack.value ? 'showing' : 'disabled'
    if (trackElement.track && trackElement.track.mode !== mode) trackElement.track.mode = mode
  })
}

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
  applyTrackSelection()
}

watch(
  () => [props.visible, props.src] as const,
  async ([visible]) => {
    destroy()
    if (visible) {
      selectedTrack.value = defaultTrackIndex(tracks.value, locale.value)
      await nextTick()
      await attach()
    }
  },
)

watch(tracks, async (value) => {
  selectedTrack.value = defaultTrackIndex(value, locale.value)
  await nextTick()
  applyTrackSelection()
})

watch(selectedTrack, applyTrackSelection)

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
          :crossorigin="tracks.length > 0 ? 'anonymous' : undefined"
          :aria-label="title ?? t('episodes.preview.title')"
          @loadedmetadata="applyTrackSelection"
        >
          <track
            v-for="(track, index) in tracks"
            :key="track.id"
            kind="subtitles"
            :src="track.src"
            :srclang="track.language"
            :label="track.label"
            :default="index === selectedTrack"
          />
        </video>
      </div>
      <div v-if="tracks.length > 0" class="flex items-center gap-2">
        <label for="preview-subtitle-track" class="text-sm">{{
          t('episodes.preview.subtitles')
        }}</label>
        <Select
          v-model="selectedTrack"
          input-id="preview-subtitle-track"
          :options="trackOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="flex-1"
        />
      </div>
      <p v-else-if="props.tracks" class="text-xs text-muted-color">
        {{ t('episodes.preview.noTracks') }}
      </p>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <p v-if="src" class="truncate text-xs text-muted-color" :title="src">{{ src }}</p>
    </div>
  </Dialog>
</template>
