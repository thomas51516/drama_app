import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { SecretBox } from '../../common/crypto/secret-box.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../../common/crypto/totp.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AppConfig } from '../../config/app-config.js';
import { type AdminAccount } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  type AdminAccessPayload,
  type AdminChallengePayload,
  type AdminClientMeta,
  CHALLENGE_TTL_SECONDS,
} from './admin-auth.types.js';
import {
  ADMIN_ACCESS_AUDIENCE,
  ADMIN_CHALLENGE_AUDIENCE,
  AdminJwtService,
} from './admin-jwt.service.js';
import {
  type AdminLoginDto,
  type AdminLoginResponseDto,
  type AdminSessionDto,
  type AdminTotpVerifyDto,
  type AdminUserDto,
} from './dto/admin-auth.dto.js';
import { TrustedDeviceService } from './trusted-device.service.js';

const REVOKED_KEY = (jti: string): string => `admin:revoked:${jti}`;
const CHALLENGE_KEY = (jti: string): string => `admin:challenge:${jti}`;

/**
 * Authentification du back-office (S03-BE-04, contrat admin v1) :
 * mot de passe Argon2id → défi TOTP (5 min) → JWT admin. 2FA imposée à la première connexion.
 */
@Injectable()
export class AdminAuthService {
  private readonly box: SecretBox;
  /** Hachage factice pour garder un temps de réponse constant quand l'e-mail est inconnu. */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: AdminJwtService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly devices: TrustedDeviceService,
  ) {
    this.box = new SecretBox(config.admin.totpEncryptionKey);
    this.dummyHash = argon2.hash(randomUUID(), { type: argon2.argon2id });
  }

  async login(dto: AdminLoginDto, meta: AdminClientMeta = {}): Promise<AdminLoginResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const account = await this.prisma.adminAccount.findUnique({ where: { email } });
    const hash = account?.passwordHash ?? (await this.dummyHash);
    const passwordOk = await argon2.verify(hash, dto.password);
    if (!account || !passwordOk) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
    if (!account.isActive) {
      throw new ForbiddenException({ code: 'ADMIN_INACTIVE', message: 'Account is disabled' });
    }

    const jti = randomUUID();
    if (account.totpEnabledAt && account.totpSecret) {
      // Appareil de confiance (B-13+) : un jeton valide pour ce compte dispense du TOTP.
      const device = dto.deviceToken
        ? await this.devices.verify(account.id, dto.deviceToken)
        : null;
      if (device) {
        const session = await this.openSession(account, meta, 'password+device', {
          deviceId: device.id,
        });
        return { status: 'ok', ...session };
      }
      const challengeToken = await this.signChallenge({ sub: account.id, jti, setup: false });
      return { status: 'totp_required', challengeToken };
    }

    // Première connexion : nouveau secret, stocké chiffré, validé par le premier code.
    const secret = generateTotpSecret();
    await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: { totpSecret: this.box.seal(secret), totpEnabledAt: null },
    });
    await this.audit.record({
      actor: { id: account.id, email: account.email },
      action: 'admin.totp_setup_started',
      targetType: 'admin_account',
      targetId: account.id,
      ip: meta.ip,
    });
    const challengeToken = await this.signChallenge({ sub: account.id, jti, setup: true });
    return {
      status: 'totp_setup_required',
      challengeToken,
      secret,
      otpauthUri: otpauthUri(secret, account.email, this.config.admin.totpIssuer),
    };
  }

  async verifyTotp(dto: AdminTotpVerifyDto, meta: AdminClientMeta = {}): Promise<AdminSessionDto> {
    let challenge: AdminChallengePayload;
    try {
      challenge = await this.jwt.verifyAsync<AdminChallengePayload>(dto.challengeToken, {
        audience: ADMIN_CHALLENGE_AUDIENCE,
      });
    } catch (err) {
      const expired = (err as Error).name === 'TokenExpiredError';
      throw new UnauthorizedException({
        code: expired ? 'CHALLENGE_EXPIRED' : 'INVALID_CHALLENGE',
        message: expired ? 'Challenge expired, log in again' : 'Invalid challenge token',
      });
    }

    const account = await this.prisma.adminAccount.findUnique({ where: { id: challenge.sub } });
    if (!account?.isActive || !account.totpSecret) {
      throw new UnauthorizedException({ code: 'INVALID_CHALLENGE', message: 'Unknown challenge' });
    }
    if (!challenge.setup && !account.totpEnabledAt) {
      throw new UnauthorizedException({ code: 'INVALID_CHALLENGE', message: 'TOTP not enrolled' });
    }

    const secret = this.box.open(account.totpSecret);
    if (!verifyTotp(secret, dto.code, { window: 1 })) {
      throw new UnauthorizedException({ code: 'INVALID_TOTP_CODE', message: 'Invalid TOTP code' });
    }

    // Défi à usage unique (Redis, TTL = durée du défi).
    const fresh = await this.redis.client.set(
      CHALLENGE_KEY(challenge.jti),
      '1',
      'EX',
      CHALLENGE_TTL_SECONDS,
      'NX',
    );
    if (fresh === null) {
      throw new UnauthorizedException({
        code: 'CHALLENGE_USED',
        message: 'Challenge already consumed',
      });
    }

    if (challenge.setup) {
      await this.prisma.adminAccount.update({
        where: { id: account.id },
        data: { totpEnabledAt: new Date() },
      });
      await this.audit.record({
        actor: { id: account.id, email: account.email },
        action: 'admin.totp_enrolled',
        targetType: 'admin_account',
        targetId: account.id,
        ip: meta.ip,
      });
    }
    const session = await this.openSession(account, meta, 'password+totp');
    if (!dto.rememberDevice) return session;
    const device = await this.devices.issue(account.id, meta);
    return {
      ...session,
      deviceToken: device.token,
      deviceTokenExpiresAt: device.expiresAt.toISOString(),
    };
  }

  /** Session admin : `lastLoginAt`, entrée d'audit `admin.login`, JWT d'accès. */
  private async openSession(
    account: AdminAccount,
    meta: AdminClientMeta,
    method: 'password+totp' | 'password+device',
    extra: Record<string, unknown> = {},
  ): Promise<AdminSessionDto> {
    const updated = await this.prisma.adminAccount.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      actor: { id: account.id, email: account.email },
      action: 'admin.login',
      targetType: 'admin_account',
      targetId: account.id,
      newValue: { method, userAgent: meta.userAgent?.slice(0, 200), ...extra },
      ip: meta.ip,
    });
    const payload: AdminAccessPayload = {
      sub: updated.id,
      jti: randomUUID(),
      email: updated.email,
      role: updated.role,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      audience: ADMIN_ACCESS_AUDIENCE,
      expiresIn: this.config.admin.jwtTtlSeconds,
    });
    return { accessToken, expiresIn: this.config.admin.jwtTtlSeconds, user: toAdminUser(updated) };
  }

  async me(admin: AuthenticatedAdmin): Promise<AdminUserDto> {
    const account = await this.prisma.adminAccount.findUnique({ where: { id: admin.id } });
    if (!account) {
      throw new UnauthorizedException({ code: 'INVALID_ADMIN_TOKEN', message: 'Unknown account' });
    }
    return toAdminUser(account);
  }

  /** Révocation du jeton courant : liste de refus Redis jusqu'à son expiration naturelle. */
  async logout(admin: AuthenticatedAdmin, meta: AdminClientMeta = {}): Promise<void> {
    const remaining = Math.max(1, admin.exp - Math.floor(Date.now() / 1000));
    await this.redis.client.set(REVOKED_KEY(admin.jti), '1', 'EX', remaining);
    await this.audit.record({
      actor: { id: admin.id, email: admin.email },
      action: 'admin.logout',
      targetType: 'admin_account',
      targetId: admin.id,
      ip: meta.ip,
    });
  }

  /** `true` si le jeton a été révoqué. Fail-closed : sans Redis, les routes admin répondent 503. */
  async isRevoked(jti: string): Promise<boolean> {
    try {
      return (await this.redis.client.exists(REVOKED_KEY(jti))) === 1;
    } catch {
      throw new ServiceUnavailableException({
        code: 'REVOCATION_CHECK_FAILED',
        message: 'Token revocation list unavailable',
      });
    }
  }

  private signChallenge(payload: AdminChallengePayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      audience: ADMIN_CHALLENGE_AUDIENCE,
      expiresIn: CHALLENGE_TTL_SECONDS,
    });
  }
}

export function toAdminUser(account: AdminAccount): AdminUserDto {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
  };
}
