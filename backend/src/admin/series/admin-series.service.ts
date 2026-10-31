import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CatalogCacheService } from '../../cache/catalog-cache.service.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type Prisma, type Series } from '../../generated/prisma/client.js';
import { MonetizationSettingsService } from '../../monetization/monetization-settings.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import { computeRightsStatus } from '../rights/rights-status.js';
import { slugify } from '../shared/slug.js';
import {
  type AdminSeriesRecord,
  adminSeriesInclude,
  toAdminSeries,
} from './admin-series.mapper.js';
import {
  type AdminSeriesDto,
  type AdminSeriesListDto,
  type CreateAdminSeriesDto,
  type ListAdminSeriesQueryDto,
  type UpdateAdminSeriesDto,
} from './dto/admin-series.dto.js';

/** Champs réservés aux rôles MONETIZATION et ADMIN (contrat admin v1, B-06). */
export const MONETIZATION_FIELDS = [
  'freeEpisodeCount',
  'coinCostPerEpisode',
  'adUnlockEnabled',
] as const;

/** Champs éditables (contrat admin v1) suivis dans le journal d'audit. */
const AUDITED_FIELDS = [
  'title',
  'synopsis',
  'genres',
  'tags',
  'originalLanguage',
  'ageRating',
  'posterVerticalUrl',
  'posterHorizontalUrl',
  'freeEpisodeCount',
  'coinCostPerEpisode',
  'adUnlockEnabled',
  'territories',
  'status',
  'publishedAt',
] as const satisfies readonly (keyof Series)[];

type AuditedSeries = Pick<Series, (typeof AUDITED_FIELDS)[number]>;

@Injectable()
export class AdminSeriesService {
  private readonly logger = new Logger(AdminSeriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CatalogCacheService,
    private readonly settings: MonetizationSettingsService,
  ) {}

  async list(query: ListAdminSeriesQueryDto): Promise<AdminSeriesListDto> {
    const where: Prisma.SeriesWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { slug: { contains: slugify(q) } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.series.findMany({
        where,
        include: adminSeriesInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.series.count({ where }),
    ]);
    return {
      items: items.map((s) => toAdminSeries(s)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AdminSeriesDto> {
    return toAdminSeries(await this.findOrThrow(id));
  }

  async create(dto: CreateAdminSeriesDto, admin: AuthenticatedAdmin, ip?: string) {
    this.assertFieldsAllowed(dto, admin);
    const slug = await this.uniqueSlug(slugify(dto.title));
    const defaults = await this.settings.get();
    const created = await this.prisma.$transaction(async (tx) => {
      const series = await tx.series.create({
        data: {
          slug,
          title: dto.title,
          synopsis: dto.synopsis ?? '',
          genres: dto.genres ?? [],
          tags: dto.tags ?? [],
          originalLanguage: dto.language ?? 'fr',
          ageRating: dto.ageRating ?? 'ALL',
          posterVerticalUrl: dto.posterVerticalUrl ?? null,
          posterHorizontalUrl: dto.posterHorizontalUrl ?? null,
          freeEpisodeCount: dto.freeEpisodeCount ?? defaults.defaultFreeEpisodes,
          coinCostPerEpisode: dto.coinCostPerEpisode ?? defaults.defaultCoinCost,
          adUnlockEnabled: dto.adUnlockEnabled ?? true,
          territories: dto.territories ?? [],
        },
        include: adminSeriesInclude,
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'series.create',
          targetType: 'series',
          targetId: series.id,
          newValue: pickAudited(series),
          ip,
        },
        tx,
      );
      return series;
    });
    return toAdminSeries(created);
  }

  async update(id: string, dto: UpdateAdminSeriesDto, admin: AuthenticatedAdmin, ip?: string) {
    this.assertFieldsAllowed(dto, admin);
    const before = await this.findOrThrow(id);
    const data: Prisma.SeriesUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.synopsis !== undefined) data.synopsis = dto.synopsis;
    if (dto.genres !== undefined) data.genres = dto.genres;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.language !== undefined) data.originalLanguage = dto.language;
    if (dto.ageRating !== undefined) data.ageRating = dto.ageRating;
    if (dto.posterVerticalUrl !== undefined) data.posterVerticalUrl = dto.posterVerticalUrl;
    if (dto.posterHorizontalUrl !== undefined) data.posterHorizontalUrl = dto.posterHorizontalUrl;
    if (dto.freeEpisodeCount !== undefined) data.freeEpisodeCount = dto.freeEpisodeCount;
    if (dto.coinCostPerEpisode !== undefined) data.coinCostPerEpisode = dto.coinCostPerEpisode;
    if (dto.adUnlockEnabled !== undefined) data.adUnlockEnabled = dto.adUnlockEnabled;
    if (dto.territories !== undefined) data.territories = dto.territories;
    if (dto.publishedAt !== undefined) {
      data.publishedAt = dto.publishedAt === null ? null : new Date(dto.publishedAt);
    }
    if (Object.keys(data).length === 0) return toAdminSeries(before);

    const updated = await this.prisma.$transaction(async (tx) => {
      const series = await tx.series.update({ where: { id }, data, include: adminSeriesInclude });
      const diff = diffChanges(pickAudited(before), pickAudited(series), AUDITED_FIELDS);
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'series.update',
            targetType: 'series',
            targetId: id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return series;
    });
    await this.cache.invalidateSeries(id);
    return toAdminSeries(updated);
  }

  /**
   * Publication : refusée (409) tant qu'aucun épisode n'est READY. Une date déjà renseignée (future :
   * publication programmée, B-04) est conservée ; sinon la série est publiée immédiatement.
   * B-12 / S09 : l'absence (ou l'expiration) d'un contrat de droits ne bloque PAS la publication
   * (décision du sprint 9, « La Nounou » est déjà publiée sans contrat) — seulement un avertissement
   * dans le journal d'audit et les logs ; `rightsStatus` dans la réponse rend l'état visible.
   */
  async publish(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<AdminSeriesDto> {
    const before = await this.findOrThrow(id);
    if (before.status === 'PUBLISHED') return toAdminSeries(before);
    const ready = await this.prisma.episode.count({
      where: { seriesId: id, transcodeStatus: 'READY' },
    });
    if (ready === 0) {
      throw new ConflictException({
        code: 'SERIES_NO_READY_EPISODE',
        message: 'A series needs at least one READY episode to be published',
      });
    }
    const rightsStatus = computeRightsStatus(before.rightsContract);
    if (rightsStatus !== 'ACTIVE') {
      this.logger.warn(
        `Series ${id} (${before.title}) published with rightsStatus=${rightsStatus} (no enforced contract, B-12)`,
      );
      await this.audit.record({
        actor: admin,
        action: 'series.publish_rights_warning',
        targetType: 'series',
        targetId: id,
        newValue: { rightsStatus },
        ip,
      });
    }
    const published = await this.transition(before, 'PUBLISHED', 'series.publish', admin, ip, {
      publishedAt: before.publishedAt ?? new Date(),
    });
    // DEF-001 : publier la série rend visibles ses épisodes prêts qui n'ont pas de date,
    // sans toucher aux épisodes programmés (B-04).
    await this.prisma.episode.updateMany({
      where: { seriesId: id, transcodeStatus: 'READY', publishedAt: null },
      data: { publishedAt: new Date() },
    });
    await this.cache.invalidateSeries(id);
    return published;
  }

  async archive(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<AdminSeriesDto> {
    const before = await this.findOrThrow(id);
    if (before.status === 'ARCHIVED') return toAdminSeries(before);
    return this.transition(before, 'ARCHIVED', 'series.archive', admin, ip);
  }

  private async transition(
    before: AdminSeriesRecord,
    status: Series['status'],
    action: string,
    admin: AuthenticatedAdmin,
    ip: string | undefined,
    extra: Prisma.SeriesUpdateInput = {},
  ): Promise<AdminSeriesDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const series = await tx.series.update({
        where: { id: before.id },
        data: { status, ...extra },
        include: adminSeriesInclude,
      });
      await this.audit.record(
        {
          actor: admin,
          action,
          targetType: 'series',
          targetId: before.id,
          oldValue: { status: before.status, publishedAt: before.publishedAt },
          newValue: { status: series.status, publishedAt: series.publishedAt },
          ip,
        },
        tx,
      );
      return series;
    });
    await this.cache.invalidateSeries(before.id);
    return toAdminSeries(updated);
  }

  /**
   * Règles de rôle du contrat : EDITOR ne touche pas aux champs de monétisation,
   * MONETIZATION ne touche qu'à eux, ADMIN tout. (SUPPORT est exclu par `@Roles()`.)
   */
  private assertFieldsAllowed(dto: UpdateAdminSeriesDto, admin: AuthenticatedAdmin): void {
    if (admin.role === 'ADMIN') return;
    const provided = Object.entries(dto)
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k);
    const monetization = new Set<string>(MONETIZATION_FIELDS);
    const forbidden =
      admin.role === 'MONETIZATION'
        ? provided.filter((f) => !monetization.has(f))
        : provided.filter((f) => monetization.has(f));
    if (forbidden.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_FIELDS',
        message: `Role ${admin.role} cannot modify: ${forbidden.join(', ')}`,
        details: { fields: forbidden, role: admin.role },
      });
    }
  }

  private async findOrThrow(id: string): Promise<AdminSeriesRecord> {
    const series = await this.prisma.series.findUnique({
      where: { id },
      include: adminSeriesInclude,
    });
    if (!series) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }
    return series;
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    for (let i = 2; i < 1000; i += 1) {
      const existing = await this.prisma.series.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      candidate = `${base}-${i}`;
    }
    throw new ConflictException({ code: 'SLUG_UNAVAILABLE', message: 'Cannot derive a slug' });
  }
}

function pickAudited(series: Series): AuditedSeries {
  const out = {} as Record<string, unknown>;
  for (const key of AUDITED_FIELDS) out[key] = series[key];
  return out as AuditedSeries;
}
