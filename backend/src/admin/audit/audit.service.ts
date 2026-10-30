import { Injectable } from '@nestjs/common';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const AUDIT_TARGET_TYPES = [
  'series',
  'episode',
  'subtitle',
  'home_banner',
  'home_row',
  'admin_account',
  'upload',
  'user',
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export interface AuditEntry {
  /** Auteur ; `null` pour une action système (worker de transcodage, webhook) ou un utilisateur final. */
  actor: Pick<AuthenticatedAdmin, 'id' | 'email'> | null;
  /** Libellé de l'auteur quand ce n'est pas un compte interne (`user:<id>`, `job:<nom>`). */
  actorLabel?: string;
  /** Verbe stable `<cible>.<action>` : `series.update`, `episode.reorder`, `admin.login`... */
  action: string;
  targetType: AuditTargetType;
  targetId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

/**
 * Journal d'audit (§5 dernier paragraphe, B-13) : chaque mutation du back-office est tracée
 * avec l'auteur, la date, l'ancienne et la nouvelle valeur. Les lignes ne sont jamais modifiées.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorLabel: entry.actorLabel ?? entry.actor?.email ?? 'system',
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        oldValue: toJson(entry.oldValue),
        newValue: toJson(entry.newValue),
        ipAddress: entry.ip?.slice(0, 45) ?? null,
      },
    });
  }
}

/** Ne conserve dans old/new que les champs réellement modifiés (lisibilité du journal). */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly (keyof T)[],
): { oldValue: Partial<T>; newValue: Partial<T>; changed: (keyof T)[] } {
  const oldValue: Partial<T> = {};
  const newValue: Partial<T> = {};
  const changed: (keyof T)[] = [];
  for (const key of keys) {
    if (!isEqual(before[key], after[key])) {
      oldValue[key] = before[key];
      newValue[key] = after[key];
      changed.push(key);
    }
  }
  return { oldValue, newValue, changed };
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (a instanceof Date ? a.getTime() : a) === (b instanceof Date ? b.getTime() : b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => isEqual(v, b[i]));
  }
  return a === b;
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return { value: null };
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
