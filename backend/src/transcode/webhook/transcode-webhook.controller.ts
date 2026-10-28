import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type Request } from 'express';
import { AuditService } from '../../admin/audit/audit.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { AppConfig } from '../../config/app-config.js';
import { TranscodeService } from '../transcode.service.js';
import { TranscodeWebhookAckDto, TranscodeWebhookDto } from './dto/transcode-webhook.dto.js';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhookSignature } from './webhook-signature.js';

/**
 * Rappel du fournisseur de transcodage géré (S02-BE-05, §9 étape 4). Authentifié par signature
 * HMAC-SHA256 du corps brut (`TRANSCODE_WEBHOOK_SECRET`), jamais par un JWT.
 */
@ApiTags('webhooks')
@Controller('webhooks/transcode')
export class TranscodeWebhookController {
  constructor(
    private readonly config: AppConfig,
    private readonly transcode: TranscodeService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Fin de transcodage (service géré)',
    description:
      'Passe l’épisode à READY ou FAILED. Cible par `episodeId`, `externalId` ou `sourceKey`. Signature : `X-Transcode-Signature: sha256=<hex HMAC-SHA256(secret, [timestamp "."] corps brut)>` ; `X-Transcode-Timestamp` (secondes epoch, optionnel, tolérance ±5 min). Idempotent.',
  })
  @ApiParam({ name: 'provider', example: 'mux' })
  @ApiHeader({ name: SIGNATURE_HEADER, required: true })
  @ApiHeader({ name: TIMESTAMP_HEADER, required: false })
  @ApiAcceptedResponse({ type: TranscodeWebhookAckDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_WEBHOOK_SIGNATURE' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  async handle(
    @Param('provider') provider: string,
    @Body() dto: TranscodeWebhookDto,
    @Req() req: RawBodyRequest<Request>,
    @Headers(SIGNATURE_HEADER) signature?: string,
    @Headers(TIMESTAMP_HEADER) timestamp?: string,
  ): Promise<TranscodeWebhookAckDto> {
    const secret = this.config.transcode.webhookSecret;
    if (!secret) {
      throw new ServiceUnavailableException({
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'TRANSCODE_WEBHOOK_SECRET is not set',
      });
    }
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    if (!verifyWebhookSignature(secret, raw, signature, timestamp)) {
      throw new UnauthorizedException({
        code: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Webhook signature verification failed',
      });
    }

    const episode = await this.transcode.findForWebhook(dto);
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }
    const source = `webhook:${provider.slice(0, 40)}`;
    const updated =
      dto.event === 'completed'
        ? await this.transcode.markReady(
            episode,
            {
              hlsKey: dto.hlsKey ?? `hls/${episode.id}/master.m3u8`,
              previewKey: dto.previewKey,
              thumbnailUrl: dto.thumbnailUrl,
              durationSeconds: dto.durationSeconds,
            },
            source,
          )
        : await this.transcode.markFailed(
            episode,
            dto.error ?? 'Provider reported a failure',
            source,
          );
    void this.audit;
    return { accepted: true, episodeId: updated.id, transcodeStatus: updated.transcodeStatus };
  }
}
