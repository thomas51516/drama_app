import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type RightsContract } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import { toRightsContractDto } from './admin-rights.mapper.js';
import {
  type CreateRightsContractDto,
  type RightsContractDto,
  type RightsContractListDto,
  type RightsContractListQueryDto,
  type UpdateRightsContractDto,
} from './dto/admin-rights.dto.js';
import { computeRightsStatus } from './rights-status.js';

const AUDITED_FIELDS = [
  'rightsHolder',
  'territories',
  'licenseStartsAt',
  'licenseEndsAt',
  'notes',
] as const;

/**
 * Droits et contrats (B-12, S09-BE). Un contrat « courant » par série (voir la décision dans
 * `prisma/schema.prisma`) : `create` échoue si une ligne existe déjà (409, utiliser `update`),
 * `update` échoue si aucune (404). Jamais exposé au public, aucune invalidation du cache catalogue.
 */
@Injectable()
export class AdminRightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getForSeries(seriesId: string): Promise<RightsContractDto> {
    await this.findSeriesOrThrow(seriesId);
    const contract = await this.prisma.rightsContract.findUnique({ where: { seriesId } });
    if (!contract) {
      throw new NotFoundException({
        code: 'RIGHTS_CONTRACT_NOT_FOUND',
        message: 'No rights contract registered for this series',
      });
    }
    return toRightsContractDto(contract);
  }

  async create(
    seriesId: string,
    dto: CreateRightsContractDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<RightsContractDto> {
    await this.findSeriesOrThrow(seriesId);
    const existing = await this.prisma.rightsContract.findUnique({ where: { seriesId } });
    if (existing) {
      throw new ConflictException({
        code: 'RIGHTS_CONTRACT_ALREADY_EXISTS',
        message: 'A rights contract already exists for this series; use PATCH to edit it',
      });
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.rightsContract.create({
        data: {
          seriesId,
          rightsHolder: dto.rightsHolder,
          territories: dto.territories ?? [],
          licenseStartsAt: new Date(dto.licenseStartsAt),
          licenseEndsAt: dto.licenseEndsAt ? new Date(dto.licenseEndsAt) : null,
          notes: dto.notes ?? null,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'rights_contract.create',
          targetType: 'rights_contract',
          targetId: contract.id,
          newValue: pickAudited(contract),
          ip,
        },
        tx,
      );
      return contract;
    });
    return toRightsContractDto(created);
  }

  async update(
    seriesId: string,
    dto: UpdateRightsContractDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<RightsContractDto> {
    await this.findSeriesOrThrow(seriesId);
    const before = await this.prisma.rightsContract.findUnique({ where: { seriesId } });
    if (!before) {
      throw new NotFoundException({
        code: 'RIGHTS_CONTRACT_NOT_FOUND',
        message: 'No rights contract registered for this series; use POST to create one',
      });
    }
    const data: Record<string, unknown> = {};
    if (dto.rightsHolder !== undefined) data.rightsHolder = dto.rightsHolder;
    if (dto.territories !== undefined) data.territories = dto.territories;
    if (dto.licenseStartsAt !== undefined) data.licenseStartsAt = new Date(dto.licenseStartsAt);
    if (dto.licenseEndsAt !== undefined) {
      data.licenseEndsAt = dto.licenseEndsAt === null ? null : new Date(dto.licenseEndsAt);
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.rightsContract.update({ where: { seriesId }, data });
      const diff = diffChanges(pickAudited(before), pickAudited(contract), AUDITED_FIELDS);
      if (diff.changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'rights_contract.update',
            targetType: 'rights_contract',
            targetId: contract.id,
            oldValue: diff.oldValue,
            newValue: diff.newValue,
            ip,
          },
          tx,
        );
      }
      return contract;
    });
    return toRightsContractDto(updated);
  }

  async remove(seriesId: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    await this.findSeriesOrThrow(seriesId);
    const before = await this.prisma.rightsContract.findUnique({ where: { seriesId } });
    if (!before) {
      throw new NotFoundException({
        code: 'RIGHTS_CONTRACT_NOT_FOUND',
        message: 'No rights contract registered for this series',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.rightsContract.delete({ where: { seriesId } });
      await this.audit.record(
        {
          actor: admin,
          action: 'rights_contract.delete',
          targetType: 'rights_contract',
          targetId: before.id,
          oldValue: pickAudited(before),
          ip,
        },
        tx,
      );
    });
  }

  /**
   * Liste de rappel pour le renouvellement : toutes les séries avec leur statut de droits.
   * `expiringWithinDays` ne garde que ce qui demande une action : NONE, EXPIRED, ou ACTIVE dont la
   * licence se termine dans la fenêtre donnée.
   */
  async list(query: RightsContractListQueryDto, now = new Date()): Promise<RightsContractListDto> {
    const series = await this.prisma.series.findMany({
      include: { rightsContract: true },
      orderBy: { title: 'asc' },
    });
    const horizon =
      query.expiringWithinDays !== undefined
        ? new Date(now.getTime() + query.expiringWithinDays * 86_400_000)
        : null;

    const items = series
      .map((s) => {
        const rightsStatus = computeRightsStatus(s.rightsContract, now);
        return {
          seriesId: s.id,
          seriesTitle: s.title,
          seriesStatus: s.status,
          rightsStatus,
          contract: s.rightsContract ? toRightsContractDto(s.rightsContract) : null,
        };
      })
      .filter((item) => {
        if (horizon === null) return true;
        if (item.rightsStatus !== 'ACTIVE') return true;
        const endsAt = item.contract?.licenseEndsAt;
        return endsAt !== null && endsAt !== undefined && new Date(endsAt) <= horizon;
      });
    return { items, total: items.length };
  }

  private async findSeriesOrThrow(seriesId: string): Promise<void> {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      select: { id: true },
    });
    if (!series) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: 'Series not found' });
    }
  }
}

function pickAudited(contract: RightsContract): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AUDITED_FIELDS) out[key] = contract[key];
  return out;
}
