import type { Subtitle } from '../types/api'
import {
  SUBTITLE_ACCEPTED_EXTENSIONS,
  SUBTITLE_LANGUAGES,
  SUBTITLE_MAX_FILE_BYTES,
} from '../types/api'

/**
 * Pure helpers of the subtitles panel (B-03): file validation, language handling,
 * SRT → VTT conversion (used by the mock, the real backend converts server-side) and the
 * `<track>` list of the synchronized preview.
 */

export const ISO_LANGUAGE_RE = /^[a-z]{2,3}$/

export function isIsoLanguageCode(value: string): boolean {
  return ISO_LANGUAGE_RE.test(value)
}

export function normalizeLanguageCode(value: string): string {
  return value.trim().toLowerCase()
}

export type SubtitleFileProblem = 'type' | 'size' | 'empty'

export function subtitleExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index === -1 ? '' : fileName.slice(index).toLowerCase()
}

/** `.srt` / `.vtt` by extension (browsers rarely set a MIME type for them), 2 MB max, not empty. */
export function validateSubtitleFile(
  file: Pick<File, 'name' | 'size'>,
): SubtitleFileProblem | null {
  if (!(SUBTITLE_ACCEPTED_EXTENSIONS as readonly string[]).includes(subtitleExtension(file.name))) {
    return 'type'
  }
  if (file.size === 0) return 'empty'
  if (file.size > SUBTITLE_MAX_FILE_BYTES) return 'size'
  return null
}

/** Minimal SRT → WebVTT: header, timestamps with dots, cue numbers kept as identifiers. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim()
  return `WEBVTT\n\n${body}\n`
}

export function isVtt(text: string): boolean {
  return text.replace(/^\uFEFF/, '').startsWith('WEBVTT')
}

const languageNamesCache = new Map<string, Intl.DisplayNames | null>()

/** Localised language name (`fr` → « français »), falling back to the code. */
export function languageName(code: string, locale = 'fr'): string {
  let names = languageNamesCache.get(locale)
  if (names === undefined) {
    try {
      names =
        typeof Intl.DisplayNames === 'function'
          ? new Intl.DisplayNames([locale], { type: 'language' })
          : null
    } catch {
      names = null
    }
    languageNamesCache.set(locale, names)
  }
  if (!names) return code
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

/** Known languages first (contract order), then the others alphabetically. */
export function sortSubtitles<T extends { language: string }>(subtitles: readonly T[]): T[] {
  const rank = (language: string): number => {
    const index = (SUBTITLE_LANGUAGES as readonly string[]).indexOf(language)
    return index === -1 ? SUBTITLE_LANGUAGES.length : index
  }
  return [...subtitles].sort(
    (a, b) => rank(a.language) - rank(b.language) || a.language.localeCompare(b.language),
  )
}

/** Replace the subtitle of the same language (one per language and episode) or append. */
export function upsertSubtitle(subtitles: readonly Subtitle[], subtitle: Subtitle): Subtitle[] {
  const others = subtitles.filter(
    (item) => item.language !== subtitle.language && item.id !== subtitle.id,
  )
  return sortSubtitles([...others, subtitle])
}

export function removeSubtitle(subtitles: readonly Subtitle[], id: string): Subtitle[] {
  return subtitles.filter((item) => item.id !== id)
}

export interface SubtitleTrack {
  id: string
  language: string
  label: string
  src: string
}

/**
 * `<track>` list of the preview dialog: one per subtitle whose URL resolves (mock assets may be
 * gone after a reload), sorted like the panel.
 */
export function subtitleTracks(
  subtitles: readonly Subtitle[],
  resolve: (url: string) => string | null,
  locale = 'fr',
): SubtitleTrack[] {
  return sortSubtitles(subtitles).flatMap((subtitle) => {
    const src = resolve(subtitle.fileUrl)
    if (!src) return []
    return [
      {
        id: subtitle.id,
        language: subtitle.language,
        label: subtitle.label || languageName(subtitle.language, locale),
        src,
      },
    ]
  })
}

/** Index of the track shown by default: the UI locale if present, else the first one; -1 = none. */
export function defaultTrackIndex(tracks: readonly SubtitleTrack[], locale = 'fr'): number {
  if (tracks.length === 0) return -1
  const preferred = tracks.findIndex((track) => track.language === locale)
  return preferred === -1 ? 0 : preferred
}
