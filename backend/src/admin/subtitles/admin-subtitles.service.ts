import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CatalogCacheService } from '../../cache/catalog-cache.service.js';
import { languageLabel } from '../../common/i18n/language-label.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { SubtitleParseError, toWebVtt } from '../../common/subtitles/srt-to-vtt.js';
import { type Subtitle } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type AdminSubtitleDto,
  MAX_SUBTITLE_BYTES,
  type UploadSubtitleDto,
} from './dto/admin-subtitle.dto.js';

/** Fichier reçu par l'intercepteur multipart (sous-ensemble de `Express.Multer.File`). */
export interface UploadedSubtitleFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const subtitleKey = (episodeId: string, language: string): string =>
  `subtitles/${episodeId}/${language}.vtt`;

/**
 * Sous-titres (S03-BE-03, B-03) : import SRT/VTT par langue et par épisode, conversion en WebVTT
 * côté serveur, dépôt dans le stockage objet, une piste par (épisode, langue) — ré-import = remplacement.
 */
@Injectable()
export class AdminSubtitlesService {
  private readonly logger = new Logger(AdminSubtitlesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly cache: CatalogCacheService,
  ) {}

  async list(episodeId: string): Promise<AdminSubtitleDto[]> {
    await this.findEpisode(episodeId);
    const subtitles = await this.prisma.subtitle.findMany({
      where: { episodeId },
      orderBy: { language: 'asc' },
    });
    return subtitles.map((s) => this.toDto(s));
  }

  async upload(
    episodeId: string,
    file: UploadedSubtitleFile | undefined,
    dto: UploadSubtitleDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<AdminSubtitleDto> {
    const episode = await this.findEpisode(episodeId);
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException({
        code: 'SUBTITLE_FILE_REQUIRED',
        message: 'A .srt or .vtt file is required in the "file" field',
      });
    }
    if (file.size > MAX_SUBTITLE_BYTES) {
      throw new BadRequestException({
        code: 'SUBTITLE_TOO_LARGE',
        message: 'Subtitle file must not exceed 2 MiB',
        details: { sizeBytes: file.size, maxBytes: MAX_SUBTITLE_BYTES },
      });
    }
    if (!/\.(srt|vtt)$/i.test(file.originalname)) {
      throw new BadRequestException({
        code: 'SUBTITLE_INVALID_FORMAT',
        message: 'Only .srt and .vtt files are accepted',
        details: { fileName: file.originalname },
      });
    }

    let vtt: string;
    try {
      vtt = toWebVtt(file.originalname, file.buffer);
    } catch (err) {
      if (err instanceof SubtitleParseError) {
        throw new BadRequestException({
          code: 'SUBTITLE_PARSE_ERROR',
          message: err.message,
          details: { line: err.line ?? null, fileName: file.originalname },
        });
      }
      throw err;
    }

    const key = subtitleKey(episodeId, dto.language);
    await this.storage.putObject(key, vtt, 'text/vtt; charset=utf-8');

    const saved = await this.prisma.$transaction(async (tx) => {
      const before = await tx.subtitle.findUnique({
        where: { episodeId_language: { episodeId, language: dto.language } },
      });
      const subtitle = await tx.subtitle.upsert({
        where: { episodeId_language: { episodeId, language: dto.language } },
        create: { episodeId, language: dto.language, fileUrl: key },
        update: { fileUrl: key, createdAt: new Date() },
      });
      await this.audit.record(
        {
          actor: admin,
          action: before ? 'subtitle.replace' : 'subtitle.upload',
          targetType: 'subtitle',
          targetId: subtitle.id,
          oldValue: before ? { language: before.language, fileUrl: before.fileUrl } : undefined,
          newValue: {
            episodeId,
            seriesId: episode.seriesId,
            language: dto.language,
            fileUrl: key,
            sourceFileName: file.originalname,
            sizeBytes: file.size,
          },
          ip,
        },
        tx,
      );
      return subtitle;
    });
    await this.cache.invalidateSeries(episode.seriesId);
    return this.toDto(saved);
  }

  async remove(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const subtitle = await this.prisma.subtitle.findUnique({
      where: { id },
      include: { episode: { select: { seriesId: true } } },
    });
    if (!subtitle) {
      throw new NotFoundException({ code: 'SUBTITLE_NOT_FOUND', message: 'Subtitle not found' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.subtitle.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'subtitle.delete',
          targetType: 'subtitle',
          targetId: id,
          oldValue: {
            episodeId: subtitle.episodeId,
            language: subtitle.language,
            fileUrl: subtitle.fileUrl,
          },
          ip,
        },
        tx,
      );
    });
    await this.cache.invalidateSeries(subtitle.episode.seriesId);
    if (!/^https?:\/\//i.test(subtitle.fileUrl)) {
      void this.storage
        .deleteObject(subtitle.fileUrl)
        .catch((err: Error) =>
          this.logger.warn(`Storage cleanup failed for ${subtitle.fileUrl}: ${err.message}`),
        );
    }
  }

  private async findEpisode(id: string): Promise<{ id: string; seriesId: string }> {
    const episode = await this.prisma.episode.findUnique({
      where: { id },
      select: { id: true, seriesId: true },
    });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }
    return episode;
  }

  private toDto(s: Subtitle): AdminSubtitleDto {
    return {
      id: s.id,
      episodeId: s.episodeId,
      language: s.language,
      label: languageLabel(s.language),
      fileUrl: /^https?:\/\//i.test(s.fileUrl) ? s.fileUrl : this.storage.publicUrl(s.fileUrl),
      createdAt: s.createdAt.toISOString(),
    };
  }
}
