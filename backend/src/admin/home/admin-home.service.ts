import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogCacheService } from '../../cache/catalog-cache.service.js';
import { HomeService } from '../../catalog/home.service.js';
import { type HomeResponseDto } from '../../catalog/dto/catalog.dto.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type HomeBanner, type HomeRow, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import {
  type CreateHomeBannerDto,
  type CreateHomeRowDto,
  type HomeBannerAdminDto,
  type HomePreviewQueryDto,
  type HomeRowAdminDto,
  type HomeRowTitlesDto,
  type HomeRowTitlesResponseDto,
  type ReorderHomeItemsDto,
  type UpdateHomeBannerDto,
  type UpdateHomeRowDto,
} from './dto/admin-home.dto.js';

const BANNER_FIELDS = [
  'seriesId',
  'imageUrl',
  'title',
  'subtitle',
  'countries',
  'position',
  'isActive',
  'startsAt',
  'endsAt',
] as const satisfies readonly (keyof HomeBanner)[];

const ROW_FIELDS = [
  'key',
  'type',
  'titles',
  'genre',
  'seriesIds',
  'countries',
  'position',
  'isActive',
] as const satisfies readonly (keyof HomeRow)[];

type BannerWithSeries = Prisma.HomeBannerGetPayload<{
  include: { series: { select: { title: true } } };
}>;
const bannerInclude = { series: { select: { title: true } } } satisfies Prisma.HomeBannerInclude;

/**
 * Mise en avant (B-05, contrat admin v1.1) : bannières et rangées de l'accueil, ordre, filtre pays.
 * Toute modification est auditée et invalide le cache de `GET /home`.
 */
@Injectable()
export class AdminHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CatalogCacheService,
    private readonly home: HomeService,
  ) {}

  // ---------------------------------------------------------------- bannières

  async listBanners(): Promise<HomeBannerAdminDto[]> {
    const banners = await this.prisma.homeBanner.findMany({
      include: bannerInclude,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return banners.map(toBannerDto);
  }

  async createBanner(dto: CreateHomeBannerDto, admin: AuthenticatedAdmin, ip?: string) {
    await this.assertSeries(dto.seriesId);
    const window = assertWindow(dto.startsAt ?? null, dto.endsAt ?? null);
    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.homeBanner.aggregate({ _max: { position: true } });
      const banner = await tx.homeBanner.create({
        data: {
          seriesId: dto.seriesId,
          imageUrl: dto.imageUrl ?? null,
          title: dto.title ?? null,
          subtitle: dto.subtitle ?? null,
          countries: dto.countries ?? [],
          isActive: dto.isActive ?? true,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          position: (last._max.position ?? 0) + 1,
        },
        include: bannerInclude,
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'home_banner.create',
          targetType: 'home_banner',
          targetId: banner.id,
          newValue: pick(banner, BANNER_FIELDS),
          ip,
        },
        tx,
      );
      return banner;
    });
    await this.cache.invalidateHome();
    return toBannerDto(created);
  }

  async updateBanner(id: string, dto: UpdateHomeBannerDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findBanner(id);
    if (dto.seriesId !== undefined && dto.seriesId !== before.seriesId) {
      await this.assertSeries(dto.seriesId);
    }
    const window = assertWindow(
      dto.startsAt === undefined ? before.startsAt : dto.startsAt,
      dto.endsAt === undefined ? before.endsAt : dto.endsAt,
    );
    const data: Prisma.HomeBannerUncheckedUpdateInput = {};
    if (dto.seriesId !== undefined) data.seriesId = dto.seriesId;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle;
    if (dto.countries !== undefined) data.countries = dto.countries;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.startsAt !== undefined) data.startsAt = window.startsAt;
    if (dto.endsAt !== undefined) data.endsAt = window.endsAt;
    if (Object.keys(data).length === 0) return toBannerDto(before);

    const updated = await this.prisma.$transaction(async (tx) => {
      const banner = await tx.homeBanner.update({ where: { id }, data, include: bannerInclude });
      const diff = diffChanges(
        pick(before, BANNER_FIELDS),
        pick(banner, BANNER_FIELDS),
        BANNER_FIELDS,
      );
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'home_banner.update',
            targetType: 'home_banner',
            targetId: id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return banner;
    });
    await this.cache.invalidateHome();
    return toBannerDto(updated);
  }

  async removeBanner(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.findBanner(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.homeBanner.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'home_banner.delete',
          targetType: 'home_banner',
          targetId: id,
          oldValue: pick(before, BANNER_FIELDS),
          ip,
        },
        tx,
      );
    });
    await this.cache.invalidateHome();
  }

  async reorderBanners(dto: ReorderHomeItemsDto, admin: AuthenticatedAdmin, ip?: string) {
    const current = await this.prisma.homeBanner.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    assertSameSet(
      current.map((b) => b.id),
      dto.ids,
      'ids must list every banner exactly once',
    );
    await this.applyOrder('homeBanner', current, dto.ids, 'home_banner.reorder', admin, ip);
    return this.listBanners();
  }

  // ------------------------------------------------------------------ rangées

  async listRows(): Promise<HomeRowAdminDto[]> {
    const rows = await this.prisma.homeRow.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toRowDto);
  }

  async createRow(dto: CreateHomeRowDto, admin: AuthenticatedAdmin, ip?: string) {
    const shape = assertRowShape(dto.type, dto.genre ?? null, dto.seriesIds ?? []);
    await this.assertSeriesAll(shape.seriesIds);
    const taken = await this.prisma.homeRow.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException({
        code: 'HOME_ROW_KEY_TAKEN',
        message: `A row with key "${dto.key}" already exists`,
        details: { key: dto.key },
      });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.homeRow.aggregate({ _max: { position: true } });
      const row = await tx.homeRow.create({
        data: {
          key: dto.key,
          type: dto.type,
          titles: normalizeTitles(dto.titles),
          genre: shape.genre,
          seriesIds: shape.seriesIds,
          countries: dto.countries ?? [],
          isActive: dto.isActive ?? true,
          position: (last._max.position ?? 0) + 1,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'home_row.create',
          targetType: 'home_row',
          targetId: row.id,
          newValue: pick(row, ROW_FIELDS),
          ip,
        },
        tx,
      );
      return row;
    });
    await this.cache.invalidateHome();
    return toRowDto(created);
  }

  async updateRow(id: string, dto: UpdateHomeRowDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findRow(id);
    const type = dto.type ?? before.type;
    const shape = assertRowShape(
      type,
      dto.genre === undefined ? before.genre : dto.genre,
      dto.seriesIds === undefined ? before.seriesIds : dto.seriesIds,
    );
    if (dto.seriesIds !== undefined) await this.assertSeriesAll(shape.seriesIds);
    if (dto.key !== undefined && dto.key !== before.key) {
      const taken = await this.prisma.homeRow.findUnique({
        where: { key: dto.key },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException({
          code: 'HOME_ROW_KEY_TAKEN',
          message: `A row with key "${dto.key}" already exists`,
          details: { key: dto.key },
        });
      }
    }
    const data: Prisma.HomeRowUncheckedUpdateInput = {};
    if (dto.key !== undefined) data.key = dto.key;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.titles !== undefined) data.titles = normalizeTitles(dto.titles);
    if (dto.genre !== undefined || dto.type !== undefined) data.genre = shape.genre;
    if (dto.seriesIds !== undefined || dto.type !== undefined) data.seriesIds = shape.seriesIds;
    if (dto.countries !== undefined) data.countries = dto.countries;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) return toRowDto(before);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.homeRow.update({ where: { id }, data });
      const diff = diffChanges(pick(before, ROW_FIELDS), pick(row, ROW_FIELDS), ROW_FIELDS);
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'home_row.update',
            targetType: 'home_row',
            targetId: id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return row;
    });
    await this.cache.invalidateHome();
    return toRowDto(updated);
  }

  async removeRow(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.findRow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.homeRow.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'home_row.delete',
          targetType: 'home_row',
          targetId: id,
          oldValue: pick(before, ROW_FIELDS),
          ip,
        },
        tx,
      );
    });
    await this.cache.invalidateHome();
  }

  async reorderRows(dto: ReorderHomeItemsDto, admin: AuthenticatedAdmin, ip?: string) {
    const current = await this.prisma.homeRow.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    assertSameSet(
      current.map((r) => r.id),
      dto.ids,
      'ids must list every row exactly once',
    );
    await this.applyOrder('homeRow', current, dto.ids, 'home_row.reorder', admin, ip);
    return this.listRows();
  }

  // ------------------------------------------------------------------- aperçu

  /** La réponse publique telle que la verrait un spectateur anonyme du pays / de la langue donnés (sans cache). */
  preview(query: HomePreviewQueryDto): Promise<HomeResponseDto> {
    return this.home.getHome(
      { country: query.country ?? null, lang: query.lang ?? 'fr' },
      { fresh: true },
    );
  }

  // ------------------------------------------------------------------ interne

  private async applyOrder(
    model: 'homeBanner' | 'homeRow',
    current: { id: string; position: number }[],
    ids: string[],
    action: string,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<void> {
    const byId = new Map(current.map((c) => [c.id, c.position]));
    if (ids.every((id, i) => byId.get(id) === i + 1)) return;
    await this.prisma.$transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        if (model === 'homeBanner') {
          await tx.homeBanner.update({ where: { id }, data: { position: i + 1 } });
        } else {
          await tx.homeRow.update({ where: { id }, data: { position: i + 1 } });
        }
      }
      await this.audit.record(
        {
          actor: admin,
          action,
          targetType: model === 'homeBanner' ? 'home_banner' : 'home_row',
          targetId: null,
          oldValue: current.map((c) => ({ id: c.id, position: c.position })),
          newValue: ids.map((id, i) => ({ id, position: i + 1 })),
          ip,
        },
        tx,
      );
    });
    await this.cache.invalidateHome();
  }

  private async findBanner(id: string): Promise<BannerWithSeries> {
    const banner = await this.prisma.homeBanner.findUnique({
      where: { id },
      include: bannerInclude,
    });
    if (!banner) {
      throw new NotFoundException({ code: 'HOME_BANNER_NOT_FOUND', message: 'Banner not found' });
    }
    return banner;
  }

  private async findRow(id: string): Promise<HomeRow> {
    const row = await this.prisma.homeRow.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'HOME_ROW_NOT_FOUND', message: 'Row not found' });
    return row;
  }

  private async assertSeries(id: string): Promise<void> {
    await this.assertSeriesAll([id]);
  }

  private async assertSeriesAll(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const unique = [...new Set(ids)];
    const found = await this.prisma.series.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    const known = new Set(found.map((s) => s.id));
    const missing = unique.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'SERIES_NOT_FOUND',
        message: 'Unknown series',
        details: { seriesIds: missing },
      });
    }
  }
}

/** Règles par type de rangée : GENRE exige `genre`, MANUAL exige `seriesIds` non vide. */
export function assertRowShape(
  type: HomeRow['type'],
  genre: string | null,
  seriesIds: string[],
): { genre: string | null; seriesIds: string[] } {
  if (type === 'GENRE' && !genre) {
    throw new BadRequestException({
      code: 'HOME_ROW_GENRE_REQUIRED',
      message: 'A GENRE row needs a genre',
    });
  }
  if (type === 'MANUAL' && seriesIds.length === 0) {
    throw new BadRequestException({
      code: 'HOME_ROW_SERIES_REQUIRED',
      message: 'A MANUAL row needs at least one series',
    });
  }
  return {
    genre: type === 'GENRE' && genre ? genre.trim().toLowerCase() : null,
    seriesIds: type === 'MANUAL' ? [...new Set(seriesIds)] : [],
  };
}

/** Fenêtre d'affichage cohérente (`endsAt` après `startsAt`). */
export function assertWindow(
  startsAt: string | Date | null,
  endsAt: string | Date | null,
): { startsAt: Date | null; endsAt: Date | null } {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && end && end.getTime() <= start.getTime()) {
    throw new BadRequestException({
      code: 'HOME_BANNER_WINDOW_INVALID',
      message: 'endsAt must be after startsAt',
    });
  }
  return { startsAt: start, endsAt: end };
}

export function assertSameSet(current: string[], requested: string[], message: string): void {
  const currentSet = new Set(current);
  const requestedSet = new Set(requested);
  const missing = current.filter((id) => !requestedSet.has(id));
  const unknown = requested.filter((id) => !currentSet.has(id));
  if (missing.length > 0 || unknown.length > 0 || requested.length !== currentSet.size) {
    throw new BadRequestException({
      code: 'HOME_ORDER_MISMATCH',
      message,
      details: { missing, unknown },
    });
  }
}

export function normalizeTitles(titles: HomeRowTitlesDto): Prisma.InputJsonObject {
  const out: Record<string, string> = { fr: titles.fr };
  for (const lang of ['en', 'es', 'pt'] as const) {
    const value = titles[lang];
    if (value) out[lang] = value;
  }
  return out;
}

function toTitles(value: unknown): HomeRowTitlesResponseDto {
  const t = (value ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return { fr: str(t.fr) ?? '', en: str(t.en), es: str(t.es), pt: str(t.pt) };
}

export function toBannerDto(b: BannerWithSeries): HomeBannerAdminDto {
  return {
    id: b.id,
    seriesId: b.seriesId,
    seriesTitle: b.series.title,
    imageUrl: b.imageUrl,
    title: b.title,
    subtitle: b.subtitle,
    countries: b.countries,
    position: b.position,
    isActive: b.isActive,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function toRowDto(r: HomeRow): HomeRowAdminDto {
  return {
    id: r.id,
    key: r.key,
    type: r.type,
    titles: toTitles(r.titles),
    genre: r.genre,
    seriesIds: r.seriesIds,
    countries: r.countries,
    position: r.position,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = obj[key];
  return out;
}
