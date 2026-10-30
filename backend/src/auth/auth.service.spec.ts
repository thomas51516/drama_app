import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { type Env } from '../config/env.schema.js';
import { type RefreshToken, type User } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

const SECRET = 'unit-test-access-secret-0123456789abcdef';

const env = {
  JWT_ACCESS_SECRET: SECRET,
  JWT_ACCESS_TTL_SECONDS: 900,
  JWT_REFRESH_SECRET: 'unit-test-refresh-pepper-0123456789abcdef',
  JWT_REFRESH_TTL_DAYS: 30,
} as unknown as Env;

function fakeUser(partial: Partial<User> = {}): User {
  return {
    id: '0192f1f0-8a5b-7c3d-9e1f-000000000001',
    type: 'GUEST',
    status: 'ACTIVE',
    phone: null,
    email: null,
    passwordHash: null,
    displayName: null,
    country: 'TG',
    language: 'fr',
    deviceId: 'device-123456',
    isVip: false,
    vipExpiresAt: null,
    autoUnlock: false,
    notificationPreferences: null,
    deletionScheduledAt: null,
    mergedIntoId: null,
    lastSeenAt: null,
    createdAt: new Date('2026-10-28T10:00:00Z'),
    updatedAt: new Date('2026-10-28T10:00:00Z'),
    ...partial,
  };
}

function makeService() {
  let refreshCounter = 0;
  const tx = {
    user: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          fakeUser({
            language: data.language as string,
            country: (data.country as string) ?? null,
          }),
        ),
      ),
      update: vi.fn(() => Promise.resolve(fakeUser())),
    },
    refreshToken: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `rt-${++refreshCounter}`, ...data }),
      ),
      update: vi.fn(() => Promise.resolve({})),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    refreshToken: { findUnique: vi.fn(), updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
  };
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: 900, issuer: 'drama-api' },
  });
  const settings = { get: vi.fn(() => Promise.resolve({ autoUnlockDefault: false })) };
  const service = new AuthService(prisma as never, jwt, new AppConfig(env), settings as never);
  return { service, prisma, tx, jwt };
}

describe('AuthService.createGuest', () => {
  it('creates a GUEST user with its wallet in one transaction and issues tokens', async () => {
    const { service, prisma, tx, jwt } = makeService();

    const result = await service.createGuest(
      { deviceId: 'device-123456', country: 'tg' },
      { userAgent: 'Drama/1.0 Android' },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'GUEST',
          country: 'TG',
          language: 'fr',
          wallet: { create: {} },
        }),
      }),
    );
    expect(result.user).toMatchObject({
      type: 'GUEST',
      status: 'ACTIVE',
      country: 'TG',
      isVip: false,
    });
    expect(result.tokens.tokenType).toBe('Bearer');
    expect(result.tokens.accessTokenExpiresIn).toBe(900);

    const payload = await jwt.verifyAsync<{ sub: string; typ: string; ut: string }>(
      result.tokens.accessToken,
    );
    expect(payload).toMatchObject({ sub: result.user.id, typ: 'user', ut: 'GUEST' });
  });

  it('stores the refresh token hashed, never in clear text', async () => {
    const { service, tx } = makeService();
    const result = await service.createGuest({ deviceId: 'device-123456' });

    const stored = tx.refreshToken.create.mock.calls[0]?.[0].data;
    expect(stored).toBeDefined();
    expect(stored?.tokenHash).toHaveLength(64);
    expect(stored?.tokenHash).not.toBe(result.tokens.refreshToken);
    expect(stored?.tokenHash).toBe(service.hashRefreshToken(result.tokens.refreshToken));
    expect(stored?.subjectType).toBe('USER');
    expect(stored?.userAgent).toBeUndefined();
    expect(result.tokens.refreshToken.length).toBeGreaterThanOrEqual(32);
  });
});

describe('AuthService.refresh', () => {
  const user = fakeUser();
  function storedToken(
    partial: Partial<RefreshToken & { user: User }> = {},
  ): RefreshToken & { user: User } {
    return {
      id: 'rt-old',
      tokenHash: 'x'.repeat(64),
      subjectType: 'USER',
      userId: user.id,
      adminId: null,
      family: '0192f1f0-8a5b-7c3d-9e1f-00000000fa11',
      deviceId: 'device-123456',
      userAgent: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      replacedById: null,
      createdAt: new Date(),
      user,
      ...partial,
    };
  }

  it('rotates: revokes the presented token, creates a new one in the same family', async () => {
    const { service, prisma, tx } = makeService();
    const stored = storedToken();
    prisma.refreshToken.findUnique.mockResolvedValue(stored);

    const result = await service.refresh({ refreshToken: 'raw-refresh-token-value-0123456789' });

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: service.hashRefreshToken('raw-refresh-token-value-0123456789') },
      }),
    );
    expect(tx.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ family: stored.family, userId: user.id }),
      }),
    );
    expect(tx.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rt-old' },
        data: expect.objectContaining({ revokedAt: expect.any(Date), replacedById: 'rt-1' }),
      }),
    );
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: user.id }, data: { lastSeenAt: expect.any(Date) } }),
    );
    expect(result.tokens.refreshToken).not.toBe('raw-refresh-token-value-0123456789');
    expect(result.user.id).toBe(user.id);
  });

  it('rejects an unknown token', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(
      service.refresh({ refreshToken: 'unknown-token-value-0123456789abcdef' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('detects reuse of a revoked token and revokes the whole family', async () => {
    const { service, prisma, tx } = makeService();
    const stored = storedToken({ revokedAt: new Date(Date.now() - 1000) });
    prisma.refreshToken.findUnique.mockResolvedValue(stored);

    await expect(
      service.refresh({ refreshToken: 'reused-token-value-0123456789abcdef' }),
    ).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_REUSED' },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { family: stored.family, revokedAt: null } }),
    );
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects an expired token without rotating', async () => {
    const { service, prisma, tx } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue(
      storedToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      service.refresh({ refreshToken: 'expired-token-value-0123456789abcdef' }),
    ).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_EXPIRED' },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses a blocked user', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue(
      storedToken({ user: fakeUser({ status: 'BLOCKED' }) }),
    );
    await expect(
      service.refresh({ refreshToken: 'blocked-token-value-0123456789abcdef' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
