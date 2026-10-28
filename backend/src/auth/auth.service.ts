import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { type Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type AuthResponseDto,
  type AuthTokensDto,
  type AuthUserDto,
} from './dto/auth-response.dto.js';
import { type GuestAuthDto } from './dto/guest-auth.dto.js';
import { type RefreshTokenDto } from './dto/refresh.dto.js';
import { type AccessTokenPayload, type ClientMeta } from './auth.types.js';

type Tx = Prisma.TransactionClient;

interface IssueOptions {
  family: string;
  deviceId?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Compte invité automatique (M-50) : crée l'utilisateur ET son portefeuille
   * dans la même transaction, puis émet la première paire de jetons.
   */
  async createGuest(dto: GuestAuthDto, meta: ClientMeta = {}): Promise<AuthResponseDto> {
    const { user, tokens } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          type: 'GUEST',
          deviceId: dto.deviceId,
          language: dto.language ?? 'fr',
          country: dto.country?.toUpperCase(),
          lastSeenAt: new Date(),
          wallet: { create: {} },
        },
      });
      const issued = await this.issueTokens(tx, created, {
        family: randomUUID(),
        deviceId: dto.deviceId,
        userAgent: meta.userAgent,
      });
      return { user: created, tokens: issued.tokens };
    });
    return { user: toAuthUser(user), tokens };
  }

  /**
   * Rotation des jetons de rafraîchissement : l'ancien est révoqué et remplacé.
   * La réutilisation d'un jeton déjà révoqué révoque toute la famille (vol présumé).
   */
  async refresh(dto: RefreshTokenDto, meta: ClientMeta = {}): Promise<AuthResponseDto> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(dto.refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.subjectType !== 'USER' || !stored.user) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Unknown refresh token',
      });
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token was already used; the whole session family has been revoked',
      });
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token expired, authenticate again',
      });
    }

    const user = stored.user;
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({ code: 'USER_BLOCKED', message: 'Account is not active' });
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      const issued = await this.issueTokens(tx, user, {
        family: stored.family,
        deviceId: stored.deviceId ?? undefined,
        userAgent: meta.userAgent,
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedById: issued.refreshTokenId },
      });
      await tx.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      return issued.tokens;
    });

    return { user: toAuthUser(user), tokens };
  }

  /** Hachage HMAC-SHA256 (pepper = JWT_REFRESH_SECRET) : la base ne stocke jamais le jeton en clair. */
  hashRefreshToken(raw: string): string {
    return createHmac('sha256', this.config.refreshTokenSecret).update(raw).digest('hex');
  }

  private async issueTokens(
    tx: Tx,
    user: User,
    opts: IssueOptions,
  ): Promise<{ tokens: AuthTokensDto; refreshTokenId: string }> {
    const payload: AccessTokenPayload = { sub: user.id, typ: 'user', ut: user.type };
    const accessToken = await this.jwt.signAsync(payload);

    const rawRefresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
    const record = await tx.refreshToken.create({
      data: {
        tokenHash: this.hashRefreshToken(rawRefresh),
        subjectType: 'USER',
        userId: user.id,
        family: opts.family,
        deviceId: opts.deviceId,
        userAgent: opts.userAgent?.slice(0, 512),
        expiresAt,
      },
    });

    return {
      refreshTokenId: record.id,
      tokens: {
        tokenType: 'Bearer',
        accessToken,
        accessTokenExpiresIn: this.config.accessTokenTtlSeconds,
        refreshToken: rawRefresh,
        refreshTokenExpiresAt: expiresAt.toISOString(),
      },
    };
  }
}

export function toAuthUser(user: User): AuthUserDto {
  return {
    id: user.id,
    type: user.type,
    status: user.status,
    language: user.language,
    country: user.country,
    isVip: user.isVip && (user.vipExpiresAt === null || user.vipExpiresAt.getTime() > Date.now()),
    vipExpiresAt: user.vipExpiresAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
