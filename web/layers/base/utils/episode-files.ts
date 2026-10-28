import { EPISODE_ACCEPTED_TYPES, EPISODE_MAX_FILE_BYTES } from '../types/api'

export type EpisodeFileRejection = 'type' | 'size' | 'empty'

export interface EpisodeFilesSelection {
  accepted: File[]
  rejected: { file: File; reason: EpisodeFileRejection }[]
}

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov']

/** MIME type to send to the API; browsers leave `file.type` empty for some .mov/.mp4 files. */
export function episodeContentType(file: File): string {
  if ((EPISODE_ACCEPTED_TYPES as readonly string[]).includes(file.type)) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.mov')) return 'video/quicktime'
  if (name.endsWith('.mp4')) return 'video/mp4'
  return file.type || 'application/octet-stream'
}

/** Split a drop/selection into files the contract accepts (mp4/mov, 1 byte to 2 GB) and rejects. */
export function selectEpisodeFiles(files: Iterable<File>): EpisodeFilesSelection {
  const selection: EpisodeFilesSelection = { accepted: [], rejected: [] }
  for (const file of files) {
    const name = file.name.toLowerCase()
    const typeOk =
      (EPISODE_ACCEPTED_TYPES as readonly string[]).includes(file.type) ||
      ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))
    if (!typeOk) selection.rejected.push({ file, reason: 'type' })
    else if (file.size === 0) selection.rejected.push({ file, reason: 'empty' })
    else if (file.size > EPISODE_MAX_FILE_BYTES) selection.rejected.push({ file, reason: 'size' })
    else selection.accepted.push(file)
  }
  return selection
}

export const EPISODE_FILE_INPUT_ACCEPT = [...EPISODE_ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(
  ',',
)
