import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { AuditService } from '../../admin/audit/audit.service.js';
import { type AuthenticatedUser } from '../../common/request-context.js';
import { type IdentityProvider, Prisma, type User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService, LOCKED_USER_STATUSES } from '../auth.service.js';
import { type AuthSessionDto } from '../dto/auth-session.dto.js';
import { AccountMergeService } from './account-merge.service.js';

/** Identité vérifiée par un fournisseur, prête à être rattachée ou retrouvée. */
export interface IdentityClaim {
  provider: IdentityProvider;
  /** `sub` Google, numéro E.164 ou e-mail en minuscules. */
  subject: string;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  passwordHash?: string | null;
}

export interface SessionContext {
  /** Utilisateur porté par le jeton de l'appel (optionnel) : invité à rattacher. */
  current?: AuthenticatedUser;
  deviceId: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Connexion par identité externe et rattachement du compte invité (M-50, contrat public v1.2) :
 * - identité inconnue + jeton invité → le compte invité devient REGISTERED en place (`linked=true`) ;
 * - identité déjà liée à un autre compte + jeton invité → fusion de l'invité dans ce compte (`linked=true`) ;
 * - identité inconnue sans jeton → nouveau compte inscrit ; identité connue sans jeton → session.
 */
@Injectable()
export class IdentityAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly merge: AccountMergeService,
    private readonly audit: AuditService,
  ) {}

  signIn(claim: IdentityClaim, ctx: SessionContext): Promise<AuthSessionDto> {
    return this.resolve(claim, ctx, 'signin');
  }

  async registerEmail(email: string, password: string, ctx: SessionContext) {
    const subject = normalizeEmail(email);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return this.resolve(
      { provider: 'EMAIL', subject, email: subject, passwordHash },
      ctx,
      'register',
    );
  }

  async loginEmail(email: string, password: string, ctx: SessionContext) {
    const subject = normalizeEmail(email);
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider: 'EMAIL', subject } },
      include: { user: { select: { passwordHash: true } } },
    });
    const hash = identity?.user.passwordHash;
    const valid = hash ? await argon2.verify(hash, password) : false;
    if (!identity || !valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Unknown e-mail or wrong password',
      });
    }
    return this.resolve({ provider: 'EMAIL', subject, email: subject }, ctx, 'signin');
  }

  private async resolve(
    claim: IdentityClaim,
    ctx: SessionContext,
    mode: 'signin' | 'register',
  ): Promise<AuthSessionDto> {
    const session = { deviceId: ctx.deviceId, userAgent: ctx.userAgent };
    const [identity, current] = await Promise.all([
      this.prisma.userIdentity.findUnique({
        where: { provider_subject: { provider: claim.provider, subject: claim.subject } },
        include: { user: true },
      }),
      ctx.current ? this.prisma.user.findUnique({ where: { id: ctx.current.id } }) : null,
    ]);
    const linkable = current && current.status === 'ACTIVE' ? current : null;

    if (identity) {
      if (mode === 'register') {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'An account already uses this e-mail, sign in instead',
        });
      }
      const owner = await this.resolveOwner(identity.user);
      if (linkable && linkable.id !== owner.id && linkable.type === 'GUEST') {
        await this.prisma.$transaction((tx) => this.merge.merge(tx, linkable, owner, ctx.ip));
        return this.auth.openSession(owner.id, { ...session, linked: true });
      }
      return this.auth.openSession(owner.id, { ...session, linked: false });
    }

    if (linkable) {
      await this.attach(linkable, claim, ctx.ip);
      return this.auth.openSession(linkable.id, { ...session, linked: true });
    }

    const created = await this.createRegistered(claim, ctx.deviceId);
    return this.auth.openSession(created.id, { ...session, linked: false });
  }

  /** Compte propriétaire d'une identité ; un compte MERGED renvoie vers sa cible. */
  private async resolveOwner(user: User): Promise<User> {
    let owner = user;
    for (let hops = 0; owner.status === 'MERGED' && owner.mergedIntoId && hops < 5; hops += 1) {
      const next = await this.prisma.user.findUnique({ where: { id: owner.mergedIntoId } });
      if (!next) break;
      owner = next;
    }
    if (LOCKED_USER_STATUSES.has(owner.status)) {
      throw new ForbiddenException({ code: 'USER_BLOCKED', message: 'Account is not active' });
    }
    return owner;
  }

  /** Rattache l'identité au compte courant, qui devient REGISTERED en place. */
  private async attach(user: User, claim: IdentityClaim, ip?: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userIdentity.create({
          data: { userId: user.id, provider: claim.provider, subject: claim.subject },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            type: 'REGISTERED',
            ...(await this.contactFields(tx, user, claim)),
          },
        });
        await this.audit.record(
          {
            actor: null,
            actorLabel: `user:${user.id}`,
            action: 'user.link',
            targetType: 'user',
            targetId: user.id,
            oldValue: { type: user.type },
            newValue: { type: 'REGISTERED', provider: claim.provider },
            ip,
          },
          tx,
        );
      });
    } catch (err) {
      throw this.translateConflict(err, claim);
    }
  }

  private async createRegistered(claim: IdentityClaim, deviceId: string): Promise<User> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            type: 'REGISTERED',
            deviceId,
            wallet: { create: {} },
            identities: { create: { provider: claim.provider, subject: claim.subject } },
          },
        });
        return tx.user.update({
          where: { id: user.id },
          data: await this.contactFields(tx, user, claim),
        });
      });
    } catch (err) {
      throw this.translateConflict(err, claim);
    }
  }

  /**
   * E-mail / téléphone / nom / mot de passe à copier sur le compte. Un e-mail (ou numéro) déjà porté
   * par un autre compte n'est pas copié quand il n'est pas l'identifiant lui-même (ex. e-mail Google).
   */
  private async contactFields(
    tx: Prisma.TransactionClient,
    user: User,
    claim: IdentityClaim,
  ): Promise<Prisma.UserUpdateInput> {
    const data: Prisma.UserUpdateInput = {};
    if (claim.email && !user.email) {
      const taken =
        claim.provider !== 'EMAIL' &&
        (await tx.user.findUnique({ where: { email: claim.email }, select: { id: true } }));
      if (!taken) data.email = claim.email;
    }
    if (claim.phone && !user.phone) {
      const taken =
        claim.provider !== 'PHONE' &&
        (await tx.user.findUnique({ where: { phone: claim.phone }, select: { id: true } }));
      if (!taken) data.phone = claim.phone;
    }
    if (claim.displayName && !user.displayName) data.displayName = claim.displayName.slice(0, 80);
    if (claim.passwordHash) data.passwordHash = claim.passwordHash;
    return data;
  }

  private translateConflict(err: unknown, claim: IdentityClaim): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const code =
        claim.provider === 'EMAIL'
          ? 'EMAIL_TAKEN'
          : claim.provider === 'PHONE'
            ? 'PHONE_TAKEN'
            : 'IDENTITY_TAKEN';
      return new ConflictException({
        code,
        message: 'This identity is already linked to an account',
      });
    }
    return err;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
