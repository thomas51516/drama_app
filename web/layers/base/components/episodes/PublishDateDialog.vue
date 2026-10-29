<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminEpisode } from '../../types/api'
import { formatZoned, fromPickerDate, publicationState, toPickerDate } from '../../utils/schedule'

/**
 * Per-episode publication date (B-04). The picker shows Lomé wall time; the PATCH sends UTC.
 * Emits the updated episode so the page can replace it in place.
 */
const props = defineProps<{ episode: AdminEpisode | null }>()
const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ saved: [episode: AdminEpisode] }>()

const { t, locale } = useI18n()
const api = useCatalogueApi()
const notify = useNotify()

const picked = ref<Date | null>(null)
const saving = ref(false)

watch(
  () => [visible.value, props.episode?.id] as const,
  ([open]) => {
    if (open) picked.value = toPickerDate(props.episode?.publishedAt ?? null)
  },
  { immediate: true },
)

const nextIso = computed(() => fromPickerDate(picked.value))
const preview = computed(() => {
  if (!nextIso.value) return null
  const date = formatZoned(nextIso.value, locale.value)
  return publicationState(nextIso.value) === 'scheduled'
    ? t('episodes.publication.scheduled', { date })
    : t('episodes.publication.published', { date })
})
const unchanged = computed(() => {
  const current = props.episode?.publishedAt ?? null
  if (current === null || nextIso.value === null) return current === nextIso.value
  return new Date(current).getTime() === new Date(nextIso.value).getTime()
})

async function save(value: string | null): Promise<void> {
  if (!props.episode) return
  saving.value = true
  try {
    const updated = await api.updateEpisode(props.episode.id, { publishedAt: value })
    emit('saved', updated)
    notify.success(value ? t('episodes.publication.saved') : t('episodes.publication.cleared'))
    visible.value = false
  } catch (err) {
    notify.apiError(err, t('episodes.publication.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('episodes.publication.dialogTitle', { number: episode?.number ?? '' })"
    :style="{ width: 'min(28rem, 95vw)' }"
    :closable="!saving"
    :dismissable-mask="!saving"
  >
    <div v-if="episode" class="flex flex-col gap-4">
      <p class="truncate text-sm font-medium" :title="episode.title">
        {{ episode.number }}. {{ episode.title }}
      </p>
      <div class="flex flex-col gap-1.5">
        <label for="episode-published-at" class="text-sm font-medium">
          {{ t('episodes.publication.field') }}
        </label>
        <DatePicker
          v-model="picked"
          input-id="episode-published-at"
          show-time
          hour-format="24"
          show-icon
          show-button-bar
          date-format="dd/mm/yy"
          :step-minute="5"
          :disabled="saving"
          fluid
        />
        <small class="text-xs text-muted-color">{{ t('episodes.publication.hint') }}</small>
      </div>
      <Tag
        v-if="preview"
        :value="preview"
        :severity="publicationState(nextIso) === 'scheduled' ? 'info' : 'success'"
        :icon="publicationState(nextIso) === 'scheduled' ? 'pi pi-calendar-clock' : 'pi pi-check'"
        class="self-start"
      />
    </div>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <Button
          v-if="episode?.publishedAt"
          :label="t('episodes.publication.clear')"
          icon="pi pi-calendar-times"
          severity="danger"
          text
          size="small"
          :disabled="saving"
          @click="save(null)"
        />
        <span v-else />
        <div class="flex gap-2">
          <Button
            :label="t('common.cancel')"
            severity="secondary"
            text
            :disabled="saving"
            @click="visible = false"
          />
          <Button
            :label="t('common.save')"
            icon="pi pi-check"
            :loading="saving"
            :disabled="unchanged || nextIso === null"
            @click="save(nextIso)"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
