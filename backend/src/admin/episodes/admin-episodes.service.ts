import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CatalogCacheService } from '../../cache/catalog-cache.service.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AppConfig } from '../../config/app-config.js';
import { type Episode } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { TranscodeService } from '../../transcode/transcode.service.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import {
  type AdminEpisodeDto,
  type CreateAdminEpisodeDto,
  type EpisodeUploadUrlDto,
  type PresignedUploadDto,
  type PresignUploadDto,
  type ReorderEpisodesDto,
  type UpdateAdminEpisodeDto,
  type UploadTargetDto,
} from './dto/admin-episode.dto.js';

const AUDITED_FIELDS = ['title', 'number', 'publishedAt', 'sourceKey', 'transcodeStatus'] as const;

@Injectable()
export class AdminEpisodesService {
  private readonly logger = new Logger(AdminEpisodesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly transcode: TranscodeService,
    private readonly config: AppConfig,
    private readonly cache: CatalogCacheService,
  ) {}

  async list(seriesId: string): Promise<AdminEpisodeDto[]> {
    await this.assertSeries(seriesId);
    const episodes = await this.prisma.episode.findMany({
      where: { seriesId },
      orderBy: { number: 'asc' },
    });
    return episodes.map(toAdminEpisode);
  }

  /** Création : numéro auto = max + 1 (B-02), ou numéro explicite s'il est libre. */
  async create(
    seriesId: string,
    dto: CreateAdminEpisodeDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ) {
    await this.assertSeries(seriesId);
    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.episode.aggregate({ where: { seriesId }, _max: { number: true } });
      const number = dto.number ?? (last._max.number ?? 0) + 1;
      if (dto.number !== undefined) {
        const taken = await tx.episode.findUnique({
          where: { seriesId_number: { seriesId, number } },
          select: { id: true },
        });
        if (taken) {
          throw new ConflictException({
            code: 'EPISODE_NUMBER_TAKEN',
            message: `Episode number ${number} already exists in this series`,
            details: { number },
          });
        }
      }
      const episode = await tx.episode.create({
        data: { seriesId, number, title: dto.title?.trim() || null },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'episode.create',
          targetType: 'episode',
          targetId: episode.id,
          newValue: { seriesId, number: episode.number, title: episode.title },
          ip,
        },
        tx,
      );
      return episode;
    });
    return toAdminEpisode(created);
  }

  async update(id: string, dto: UpdateAdminEpisodeDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findOrThrow(id);
    const data: { title?: string | null; publishedAt?: Date | null } = {};
    if (dto.title !== undefined) data.title = dto.title?.trim() || null;
    if (dto.publishedAt !== undefined) {
      data.publishedAt = dto.publishedAt === null ? null : new Date(dto.publishedAt);
    }
    if (Object.keys(data).length === 0) return toAdminEpisode(before);
    const updated = await this.prisma.$transaction(async (tx) => {
      const episode = await tx.episode.update({ where: { id }, data });
      const diff = diffChanges(before, episode, AUDITED_FIELDS);
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'episode.update',
            targetType: 'episode',
            targetId: id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return episode;
    });
    await this.cache.invalidateSeries(before.seriesId);
    return toAdminEpisode(updated);
  }

  async remove(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const episode = await this.findOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.episode.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'episode.delete',
          targetType: 'episode',
          targetId: id,
          oldValue: toAdminEpisode(episode),
          ip,
        },
        tx,
      );
    });
    await this.cache.invalidateSeries(episode.seriesId);
    // Nettoyage du stockage en arrière-plan (best effort, journalisé).
    void Promise.all([
      this.storage.deletePrefix(`hls/${id}/`),
      this.storage.deletePrefix(`sources/${episode.seriesId}/${id}/`),
      this.storage.deletePrefix(`subtitles/${id}/`),
    ]).catch((err: Error) =>
      this.logger.warn(`Storage cleanup failed for episode ${id}: ${err.message}`),
    );
  }

  /** Réordonnancement : la liste doit contenir exactement les épisodes de la série ; renumérote 1..n. */
  async reorder(seriesId: string, dto: ReorderEpisodesDto, admin: AuthenticatedAdmin, ip?: string) {
    await this.assertSeries(seriesId);
    const current = await this.prisma.episode.findMany({
      where: { seriesId },
      orderBy: { number: 'asc' },
    });
    const currentIds = new Set(current.map((e) => e.id));
    const requested = new Set(dto.episodeIds);
    const missing = [...currentIds].filter((e) => !requested.has(e));
    const unknown = dto.episodeIds.filter((e) => !currentIds.has(e));
    if (missing.length > 0 || unknown.length > 0 || dto.episodeIds.length !== currentIds.size) {
      throw new BadRequestException({
        code: 'EPISODE_ORDER_MISMATCH',
        message: 'episodeIds must list every episode of the series exactly once',
        details: { missing, unknown },
      });
    }

    const byId = new Map(current.map((e) => [e.id, e]));
    const changed = dto.episodeIds.some((id, i) => byId.get(id)?.number !== i + 1);
    if (!changed) return current.map(toAdminEpisode);

    const reordered = await this.prisma.$transaction(async (tx) => {
      // Deux passes pour respecter l'unicité (series_id, number) : numéros temporaires négatifs.
      for (const [i, id] of dto.episodeIds.entries()) {
        await tx.episode.update({ where: { id }, data: { number: -(i + 1) } });
      }
      for (const [i, id] of dto.episodeIds.entries()) {
        await tx.episode.update({ where: { id }, data: { number: i + 1 } });
      }
      await this.audit.record(
        {
          actor: admin,
          action: 'episode.reorder',
          targetType: 'series',
          targetId: seriesId,
          oldValue: current.map((e) => ({ id: e.id, number: e.number })),
          newValue: dto.episodeIds.map((id, i) => ({ id, number: i + 1 })),
          ip,
        },
        tx,
      );
      return tx.episode.findMany({ where: { seriesId }, orderBy: { number: 'asc' } });
    });
    await this.cache.invalidateSeries(seriesId);
    return reordered.map(toAdminEpisode);
  }

  /** URL pré-signée PUT pour le fichier maître : `sources/{seriesId}/{episodeId}/{fileName}`. */
  async createUploadUrl(
    id: string,
    dto: EpisodeUploadUrlDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<UploadTargetDto> {
    const episode = await this.findOrThrow(id);
    const sourceKey = `sources/${episode.seriesId}/${episode.id}/${safeFileName(dto.fileName)}`;
    const ttl = this.config.uploadUrlTtlSeconds;
    const presigned = await this.storage.presignPut(sourceKey, dto.contentType, ttl);
    await this.prisma.$transaction(async (tx) => {
      await tx.episode.update({
        where: { id },
        data: { sourceKey, transcodeStatus: 'PENDING', transcodeError: null },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'episode.upload_url',
          targetType: 'episode',
          targetId: id,
          oldValue: { sourceKey: episode.sourceKey, transcodeStatus: episode.transcodeStatus },
          newValue: {
            sourceKey,
            transcodeStatus: 'PENDING',
            contentType: dto.contentType,
            sizeBytes: dto.sizeBytes,
          },
          ip,
        },
        tx,
      );
    });
    return {
      uploadUrl: presigned.url,
      method: 'PUT',
      headers: { 'Content-Type': dto.contentType },
      sourceKey,
      expiresAt: presigned.expiresAt,
    };
  }

  /** Le navigateur a terminé le PUT : vérifie l'objet puis met le transcodage en file. */
  async markUploaded(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<AdminEpisodeDto> {
    return this.enqueue(id, 'episode.uploaded', admin, ip);
  }

  async retranscode(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<AdminEpisodeDto> {
    return this.enqueue(id, 'episode.retranscode', admin, ip);
  }

  private async enqueue(id: string, action: string, admin: AuthenticatedAdmin, ip?: string) {
    const episode = await this.findOrThrow(id);
    if (!episode.sourceKey) {
      throw new ConflictException({
        code: 'SOURCE_MISSING',
        message: 'Request an upload URL first',
      });
    }
    const head = await this.storage.head(episode.sourceKey);
    if (!head) {
      throw new ConflictException({
        code: 'SOURCE_NOT_UPLOADED',
        message: 'Source file not found in storage; upload it first',
        details: { sourceKey: episode.sourceKey },
      });
    }
    const queued = await this.transcode.submit({ ...episode, transcodeStatus: 'UPLOADED' });
    await this.audit.record({
      actor: admin,
      action,
      targetType: 'episode',
      targetId: id,
      oldValue: { transcodeStatus: episode.transcodeStatus },
      newValue: {
        transcodeStatus: queued.transcodeStatus,
        sourceKey: episode.sourceKey,
        sizeBytes: head.sizeBytes,
        provider: this.transcode.providerName,
        externalId: queued.transcodeExternalId,
      },
      ip,
    });
    return toAdminEpisode(queued);
  }

  /** Affiches : clé `posters/{uuid}/{fileName}`, URL publique CDN à enregistrer sur la série. */
  async presignPoster(
    dto: PresignUploadDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<PresignedUploadDto> {
    const key = `posters/${randomUUID()}/${safeFileName(dto.fileName)}`;
    const presigned = await this.storage.presignPut(
      key,
      dto.contentType,
      this.config.uploadUrlTtlSeconds,
    );
    await this.audit.record({
      actor: admin,
      action: 'upload.presign',
      targetType: 'upload',
      targetId: key,
      newValue: { kind: dto.kind, contentType: dto.contentType },
      ip,
    });
    return {
      uploadUrl: presigned.url,
      method: 'PUT',
      headers: { 'Content-Type': dto.contentType },
      key,
      publicUrl: this.storage.publicUrl(key),
      expiresAt: presigned.expiresAt,
    };
  }

  private async assertSeries(seriesId: string): Promise<void> {
    const exists = await this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }
  }

  private async findOrThrow(id: string): Promise<Episode> {
    const episode = await this.prisma.episode.findUnique({ where: { id } });
    if (!episode) {
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    }
    return episode;
  }
}

export function toAdminEpisode(e: Episode): AdminEpisodeDto {
  return {
    id: e.id,
    seriesId: e.seriesId,
    number: e.number,
    title: e.title,
    durationSeconds: e.durationSeconds,
    transcodeStatus: e.transcodeStatus,
    sourceKey: e.sourceKey,
    hlsKey: e.hlsKey,
    thumbnailUrl: e.thumbnailUrl,
    previewKey: e.previewKey,
    publishedAt: e.publishedAt?.toISOString() ?? null,
    transcodeError: e.transcodeError,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Nom de fichier sûr pour une clé S3 : ASCII, sans chemin, extension conservée. */
export function safeFileName(fileName: string): string {
  const ext = extname(fileName)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '');
  const stem = basename(fileName, extname(fileName))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return `${stem || 'file'}${ext}`;
}
