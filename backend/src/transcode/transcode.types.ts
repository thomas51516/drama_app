import { type Episode } from '../generated/prisma/client.js';

export const TRANSCODE_QUEUE = 'transcode';
export const TRANSCODE_PROVIDER = Symbol('TRANSCODE_PROVIDER');

export interface TranscodeJobData {
  episodeId: string;
  sourceKey: string;
}

export interface TranscodeSubmission {
  /** Identifiant du job (BullMQ ou fournisseur géré), conservé dans `episodes.transcode_external_id`. */
  externalId?: string;
  /** Statut immédiat : `UPLOADED` (en file) ou `PROCESSING` (pris en charge par un service externe). */
  status: 'UPLOADED' | 'PROCESSING';
}

/**
 * Port « fournisseur de transcodage » (§9). Deux adaptateurs : `local` (ffmpeg + BullMQ dans le
 * processus) et `webhook` (service géré à choisir en S02-PM-01, notifié puis rappelé par webhook).
 */
export interface TranscodeProvider {
  readonly name: 'local' | 'webhook';
  submit(episode: Episode): Promise<TranscodeSubmission>;
}

export interface TranscodeResult {
  hlsKey: string;
  previewKey?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}
