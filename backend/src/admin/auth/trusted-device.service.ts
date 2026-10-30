import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AppConfig } from '../../config/app-config.js';
import { type AdminTrustedDevice, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { type AdminClientMeta } from './admin-auth.types.js';
import { type TrustedDeviceDto } from './dto/admin-auth.dto.js';

export interface IssuedDevice {
  id: string;
  token: string;
  expiresAt: Date;
}

/**
 * Appareils de confiance du back-office (B-13+, contrat v1.3) : après un TOTP réussi, un jeton
 * aléatoire de 256 bits est remis au navigateur et stocké haché (SHA-256). Présenté au login, il
 * dispense du TOTP pendant `TRUSTED_DEVICE_DAYS` jours. Révocable par l'intéressé et par un ADMIN ;
 * la réinitialisation du TOTP et la désactivation du compte révoquent tout.
 */
@Injectable()
export class TrustedDeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Libellé lisible dérivé du User-Agent (navigateur et système), sans en conserver le détail. */
  static labelFrom(userAgent?: string): string {
    if (!userAgent) return 'Navigateur inconnu';
    const ua = userAgent;
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navigateur';
    const os = /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
    const label = os ? `${browser} sur ${os}` : browser;
    return label.slice(0, 200);
  }

  async issue(adminId: string, meta: AdminClientMeta = {}): Promise<IssuedDevice> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.admin.trustedDeviceDays * 86_400_000);
    const device = await this.prisma.adminTrustedDevice.create({
      data: {
        adminId,
        tokenHash: TrustedDeviceService.hash(token),
        label: TrustedDeviceService.labelFrom(meta.userAgent),
        expiresAt,
      },
    });
    await this.audit.record({
      actor: null,
      actorLabel: `admin:${adminId}`,
      action: 'admin.device_trusted',
      targetType: 'admin_trusted_device',
      targetId: device.id,
      newValue: { label: device.label, expiresAt },
      ip: meta.ip,
    });
    return { id: device.id, token, expiresAt };
  }

  /** Appareil valide pour ce compte (non révoqué, non expiré) ; met à jour `lastUsedAt`. */
  async verify(adminId: string, token: string): Promise<AdminTrustedDevice | null> {
    if (!token) return null;
    const device = await this.prisma.adminTrustedDevice.findUnique({
      where: { tokenHash: TrustedDeviceService.hash(token) },
    });
    if (!device || device.adminId !== adminId || device.revokedAt) return null;
    if (device.expiresAt.getTime() <= Date.now()) return null;
    return this.prisma.adminTrustedDevice.update({
      where: { id: device.id },
      data: { lastUsedAt: new Date() },
    });
  }

  /** `current` = appareil lié à la session courante (claim `did` du JWT admin, contrat v1.4). */
  async list(adminId: string, currentDeviceId?: string): Promise<TrustedDeviceDto[]> {
    const devices = await this.prisma.adminTrustedDevice.findMany({
      where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return devices.map((d) => toTrustedDeviceDto(d, d.id === currentDeviceId));
  }

  async revoke(admin: AuthenticatedAdmin, deviceId: string, ip?: string): Promise<void> {
    const device = await this.prisma.adminTrustedDevice.findFirst({
      where: { id: deviceId, adminId: admin.id, revokedAt: null },
    });
    if (!device) {
      throw new NotFoundException({
        code: 'DEVICE_NOT_FOUND',
        message: 'Trusted device not found',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.adminTrustedDevice.update({
        where: { id: device.id },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'admin.device_revoked',
          targetType: 'admin_trusted_device',
          targetId: device.id,
          oldValue: { label: device.label },
          ip,
        },
        tx,
      );
    });
  }

  /** Révoque tous les appareils actifs d'un compte ; renvoie le nombre révoqué. */
  async revokeAll(
    adminId: string,
    tx: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ): Promise<number> {
    const result = await tx.adminTrustedDevice.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count;
  }
}

export function toTrustedDeviceDto(d: AdminTrustedDevice, current = false): TrustedDeviceDto {
  return {
    id: d.id,
    label: d.label,
    current,
    createdAt: d.createdAt.toISOString(),
    lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
    expiresAt: d.expiresAt.toISOString(),
  };
}
