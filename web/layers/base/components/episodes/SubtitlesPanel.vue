<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AdminEpisode, Subtitle } from '../../types/api'
import {
  SUBTITLE_ACCEPTED_EXTENSIONS,
  SUBTITLE_LANGUAGES,
  SUBTITLE_MAX_FILE_BYTES,
} from '../../types/api'
import { useSubtitlesApi } from '../../composables/useSubtitlesApi'
import { useMediaUrl } from '../../composables/useMediaUrl'
import { useNotify } from '../../composables/useNotify'
import { formatBytes } from '../../utils/format'
import {
  isIsoLanguageCode,
  languageName,
  normalizeLanguageCode,
  removeSubtitle,
  sortSubtitles,
  upsertSubtitle,
  validateSubtitleFile,
} from '../../utils/subtitles'

/**
 * Subtitles of one episode (B-03): list by language, upload (.srt/.vtt + language), replace,
 * delete. Emits `changed` with the new list so the page can refresh the preview tracks.
 */
const props = defineProps<{
  visible: boolean
  episode: AdminEpisode | null
  canEdit: boolean
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: [episodeId: string, subtitles: Subtitle[]]
}>()

const { t, d, locale } = useI18n()
const api = useSubtitlesApi()
const media = useMediaUrl()
const notify = useNotify()
const confirm = useConfirm()

const subtitles = ref<Subtitle[]>([])
const loading = ref(false)
const loadError = ref(false)
const uploading = ref(false)
const deletingId = ref<string | null>(null)

const OTHER = 'other'
const languageChoice = ref<string>('fr')
const customLanguage = ref('')
const input = ref<HTMLInputElement | null>(null)

const languageOptions = computed(() => [
  ...SUBTITLE_LANGUAGES.map((code) => ({
    value: code,
    label: `${languageName(code, locale.value)} (${code})`,
  })),
  { value: OTHER, label: t('subtitles.otherLanguage') },
])

const effectiveLanguage = computed(() =>
  languageChoice.value === OTHER
    ? normalizeLanguageCode(customLanguage.value)
    : languageChoice.value,
)
const languageValid = computed(() => isIsoLanguageCode(effectiveLanguage.value))
const existingForLanguage = computed(() =>
  subtitles.value.find((subtitle) => subtitle.language === effectiveLanguage.value),
)
const accept = SUBTITLE_ACCEPTED_EXTENSIONS.join(',')

async function load(): Promise<void> {
  if (!props.episode) return
  loading.value = true
  loadError.value = false
  try {
    subtitles.value = sortSubtitles(await api.listSubtitles(props.episode.id))
  } catch (err) {
    loadError.value = true
    notify.apiError(err, t('subtitles.loadError'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.episode?.id] as const,
  ([visible]) => {
    if (visible) {
      languageChoice.value = 'fr'
      customLanguage.value = ''
      void load()
    }
  },
  { immediate: true },
)

function close(): void {
  emit('update:visible', false)
}

function pickFile(): void {
  if (!languageValid.value) {
    notify.warn(t('subtitles.invalidLanguage'))
    return
  }
  input.value?.click()
}

function replace(subtitle: Subtitle): void {
  if ((SUBTITLE_LANGUAGES as readonly string[]).includes(subtitle.language)) {
    languageChoice.value = subtitle.language
  } else {
    languageChoice.value = OTHER
    customLanguage.value = subtitle.language
  }
  input.value?.click()
}

async function onFileSelected(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || !props.episode) return
  const problem = validateSubtitleFile(file)
  if (problem) {
    notify.warn(t(`subtitles.rejected.${problem}`, { max: formatBytes(SUBTITLE_MAX_FILE_BYTES) }))
    return
  }
  const language = effectiveLanguage.value
  const replacing = Boolean(existingForLanguage.value)
  uploading.value = true
  try {
    const created = await api.uploadSubtitle(props.episode.id, file, language)
    subtitles.value = upsertSubtitle(subtitles.value, created)
    notify.success(
      t(replacing ? 'subtitles.toasts.replaced' : 'subtitles.toasts.uploaded', {
        language: languageName(language, locale.value),
      }),
    )
    emit('changed', props.episode.id, subtitles.value)
  } catch (err) {
    notify.apiError(err, t('subtitles.toasts.uploadFailed'))
  } finally {
    uploading.value = false
  }
}

function askDelete(subtitle: Subtitle): void {
  confirm.require({
    header: t('subtitles.actions.delete'),
    message: t('subtitles.actions.deleteConfirm', {
      language: languageName(subtitle.language, locale.value),
    }),
    icon: 'pi pi-trash',
    acceptLabel: t('common.delete'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => void remove(subtitle),
  })
}

async function remove(subtitle: Subtitle): Promise<void> {
  if (!props.episode) return
  deletingId.value = subtitle.id
  try {
    await api.deleteSubtitle(subtitle.id)
    subtitles.value = removeSubtitle(subtitles.value, subtitle.id)
    notify.success(t('subtitles.toasts.deleted'))
    emit('changed', props.episode.id, subtitles.value)
  } catch (err) {
    notify.apiError(err, t('subtitles.actions.delete'))
  } finally {
    deletingId.value = null
  }
}

function fileHref(subtitle: Subtitle): string | undefined {
  return media.resolve(subtitle.fileUrl) ?? undefined
}
</script>

<template>
  <Drawer
    :visible="visible"
    position="right"
    class="!w-full sm:!w-[30rem]"
    :header="t('subtitles.title')"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="episode" class="flex h-full flex-col gap-5">
      <div>
        <p class="font-medium">{{ episode.number }}. {{ episode.title }}</p>
        <p class="text-sm text-muted-color">{{ t('subtitles.hint') }}</p>
      </div>

      <Message v-if="loadError" severity="error" :closable="false">
        <div class="flex flex-wrap items-center gap-3">
          <span>{{ t('subtitles.loadError') }}</span>
          <Button
            :label="t('common.retry')"
            size="small"
            severity="danger"
            outlined
            @click="load"
          />
        </div>
      </Message>

      <section class="rounded-lg border border-surface-200">
        <ul v-if="subtitles.length > 0" class="divide-y divide-surface-200">
          <li
            v-for="subtitle in subtitles"
            :key="subtitle.id"
            class="flex items-center gap-3 px-4 py-3"
            data-testid="subtitle-row"
          >
            <Tag :value="subtitle.language" severity="secondary" class="font-mono uppercase" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ subtitle.label || languageName(subtitle.language, locale) }}
              </p>
              <p class="truncate text-xs text-muted-color">
                {{ t('subtitles.addedOn', { date: d(new Date(subtitle.createdAt), 'long') }) }}
              </p>
            </div>
            <a
              v-if="fileHref(subtitle)"
              :href="fileHref(subtitle)"
              target="_blank"
              rel="noopener"
              class="pi pi-external-link text-sm text-muted-color hover:text-primary"
              :title="t('subtitles.actions.open')"
              :aria-label="t('subtitles.actions.open')"
            />
            <Button
              v-if="canEdit"
              icon="pi pi-upload"
              size="small"
              text
              :disabled="uploading"
              :aria-label="t('subtitles.actions.replace')"
              :title="t('subtitles.actions.replace')"
              @click="replace(subtitle)"
            />
            <Button
              v-if="canEdit"
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              :loading="deletingId === subtitle.id"
              :aria-label="t('subtitles.actions.delete')"
              :title="t('subtitles.actions.delete')"
              @click="askDelete(subtitle)"
            />
          </li>
        </ul>
        <div v-else-if="loading" class="px-4 py-6 text-center text-sm text-muted-color">
          <i class="pi pi-spin pi-spinner mr-2" aria-hidden="true" />{{ t('common.loading') }}
        </div>
        <div v-else class="px-4 py-8 text-center">
          <i class="pi pi-language text-3xl text-muted-color" aria-hidden="true" />
          <p class="mt-2 text-sm font-medium">{{ t('subtitles.empty.title') }}</p>
          <p class="mt-1 text-xs text-muted-color">{{ t('subtitles.empty.hint') }}</p>
        </div>
      </section>

      <section v-if="canEdit" class="flex flex-col gap-3 rounded-lg bg-surface-50 p-4">
        <h3 class="text-sm font-semibold">{{ t('subtitles.upload.title') }}</h3>
        <div class="flex flex-col gap-2">
          <label for="subtitle-language" class="text-sm">{{
            t('subtitles.upload.language')
          }}</label>
          <Select
            v-model="languageChoice"
            input-id="subtitle-language"
            :options="languageOptions"
            option-label="label"
            option-value="value"
            fluid
            :disabled="uploading"
          />
          <InputText
            v-if="languageChoice === OTHER"
            v-model="customLanguage"
            maxlength="3"
            :placeholder="t('subtitles.upload.customPlaceholder')"
            :invalid="customLanguage.length > 0 && !languageValid"
            :aria-label="t('subtitles.upload.customLanguage')"
            fluid
            class="font-mono lowercase"
            :disabled="uploading"
          />
        </div>
        <Message v-if="existingForLanguage" severity="warn" :closable="false" size="small">
          {{
            t('subtitles.upload.willReplace', { language: languageName(effectiveLanguage, locale) })
          }}
        </Message>
        <input
          ref="input"
          type="file"
          class="sr-only"
          :accept="accept"
          :disabled="uploading"
          data-testid="subtitle-file-input"
          @change="onFileSelected"
        />
        <div class="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            :label="
              existingForLanguage ? t('subtitles.actions.replace') : t('subtitles.upload.choose')
            "
            icon="pi pi-upload"
            size="small"
            :loading="uploading"
            :disabled="!languageValid"
            @click="pickFile"
          />
          <span class="text-xs text-muted-color">
            {{ t('subtitles.upload.limits', { max: formatBytes(SUBTITLE_MAX_FILE_BYTES) }) }}
          </span>
        </div>
      </section>
      <Message v-else severity="secondary" :closable="false" size="small">
        {{ t('subtitles.readOnly') }}
      </Message>

      <div class="mt-auto flex justify-end">
        <Button :label="t('common.close')" severity="secondary" outlined @click="close" />
      </div>
    </div>
  </Drawer>
</template>
