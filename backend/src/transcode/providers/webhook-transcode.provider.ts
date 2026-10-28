import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { type Episode } from '../../generated/prisma/client.js';
import { StorageService } from '../../storage/storage.service.js';
import { type TranscodeProvider, type TranscodeSubmission } from '../transcode.types.js';

/**
 * Adaptateur « service géré » (Mux, Cloudflare Stream, Bunny... à choisir en S02-PM-01).
 * Si `TRANSCODE_SUBMIT_URL` est défini, notifie le service d'une nouvelle source (JSON signé HMAC,
 * URL de lecture pré-signée 24 h) ; dans tous les cas la fin du traitement arrive par
 * `POST /webhooks/transcode/{provider}`. Sans URL, l'épisode reste PROCESSING jusqu'au webhook.
 */
@Injectable()
export class WebhookTranscodeProvider implements TranscodeProvider {
  readonly name = 'webhook' as const;
  private readonly logger = new Logger(WebhookTranscodeProvider.name);

  constructor(
    private readonly config: AppConfig,
    private readonly storage: StorageService,
  ) {}

  async submit(episode: Episode): Promise<TranscodeSubmission> {
    if (!episode.sourceKey) throw new Error('Episode has no sourceKey');
    const { submitUrl, webhookSecret } = this.config.transcode;
    if (!submitUrl) {
      this.logger.log(
        `Episode ${episode.id} awaiting managed transcoder (no TRANSCODE_SUBMIT_URL configured)`,
      );
      return { status: 'PROCESSING' };
    }
    const body = JSON.stringify({
      episodeId: episode.id,
      sourceKey: episode.sourceKey,
      sourceUrl: await this.storage.presignGet(episode.sourceKey, 86_400),
      outputPrefix: `hls/${episode.id}/`,
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (webhookSecret) {
      headers['x-transcode-signature'] =
        `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`;
    }
    const res = await fetch(submitUrl, { method: 'POST', headers, body });
    if (!res.ok) throw new Error(`Transcoder submit failed: HTTP ${res.status}`);
    const payload = (await res.json().catch(() => ({}))) as { id?: string; jobId?: string };
    return { externalId: payload.id ?? payload.jobId, status: 'PROCESSING' };
  }
}
