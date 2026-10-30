import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { SecretBox } from '../../common/crypto/secret-box.js';
import { totpCode } from '../../common/crypto/totp.js';
import { AppConfig } from '../../config/app-config.js';
import { type Env } from '../../config/env.schema.js';
import { type AdminAccount } from '../../generated/prisma/client.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ADMIN_ACCESS_AUDIENCE, AdminJwtService } from './admin-jwt.service.js';

const env = {
  ADMIN_JWT_SECRET: 'unit-test-admin-secret-0123456789abcdef',
  ADMIN_JWT_TTL_SECONDS: 3600,
  TOTP_ENCRYPTION_KEY: 'unit-test-totp-key-0123456789abcdef',
  TOTP_ISSUER: 'DRAMA test',
} as unknown as Env;

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await argon2.hash('Secret!2026', { type: argon2.argon2id });
});

function account(partial: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: '0192f1f0-8a5b-7c3d-9e1f-00000000ad01',
    email: 'admin@drama.local',
    passwordHash,
    displayName: 'Admin',
    role: 'ADMIN',
    isActive: true,
    totpSecret: null,
    totpEnabledAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function makeService(initial: AdminAccount | null) {
  let stored = initial;
  const prisma = {
    adminAccount: {
      findUnique: vi.fn(() => Promise.resolve(stored)),
      update: vi.fn(({ data }: { data: Partial<AdminAccount> }) => {
        stored = { ...(stored as AdminAccount), ...data };
        return Promise.resolve(stored);
      }),
    },
  };
  const redisKeys = new Map<string, string>();
  const redis = {
    client: {
      set: vi.fn((key: string, value: string, _ex: string, _ttl: number, nx?: string) => {
        if (nx === 'NX' && redisKeys.has(key)) return Promise.resolve(null);
        redisKeys.set(key, value);
        return Promise.resolve('OK');
      }),
      exists: vi.fn((key: string) => Promise.resolve(redisKeys.has(key) ? 1 : 0)),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const config = new AppConfig(env);
  const jwt = new AdminJwtService(config);
  const devices = {
    verify: vi.fn(() => Promise.resolve(null)),
    issue: vi.fn(() =>
      Promise.resolve({ token: 'device-token', expiresAt: new Date('2026-11-29T00:00:00Z') }),
    ),
  };
  const service = new AdminAuthService(
    prisma as never,
    redis as never,
    jwt,
    config,
    audit as never,
    devices as never,
  );
  return { service, prisma, redis, audit, jwt, devices, stored: () => stored };
}

describe('AdminAuthService.login', () => {
  it('rejects unknown e-mail and wrong password with INVALID_CREDENTIALS', async () => {
    const unknown = makeService(null);
    await expect(
      unknown.service.login({ email: 'nobody@drama.local', password: 'Secret!2026' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    const wrong = makeService(account());
    await expect(
      wrong.service.login({ email: 'admin@drama.local', password: 'WrongPass!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(wrong.prisma.adminAccount.update).not.toHaveBeenCalled();
  });

  it('refuses a disabled account', async () => {
    const { service } = makeService(account({ isActive: false }));
    await expect(
      service.login({ email: 'admin@drama.local', password: 'Secret!2026' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('first login: returns totp_setup_required with a secret stored encrypted', async () => {
    const { service, stored } = makeService(account());
    const res = await service.login({ email: 'Admin@Drama.local', password: 'Secret!2026' });
    expect(res.status).toBe('totp_setup_required');
    expect(res.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(res.otpauthUri).toContain(`secret=${res.secret}`);
    expect((res.challengeToken as string).split('.')).toHaveLength(3);
    const persisted = stored()?.totpSecret;
    expect(persisted).toBeDefined();
    expect(persisted).not.toContain(res.secret as string);
    expect(new SecretBox(env.TOTP_ENCRYPTION_KEY).open(persisted as string)).toBe(res.secret);
  });

  it('enrolled account: returns totp_required without any secret', async () => {
    const sealed = new SecretBox(env.TOTP_ENCRYPTION_KEY).seal('JBSWY3DPEHPK3PXP');
    const { service } = makeService(account({ totpSecret: sealed, totpEnabledAt: new Date() }));
    const res = await service.login({ email: 'admin@drama.local', password: 'Secret!2026' });
    expect(res).toEqual({ status: 'totp_required', challengeToken: expect.any(String) });
  });
});

describe('AdminAuthService.verifyTotp', () => {
  it('completes the setup flow, issues an admin JWT (aud admin) and writes audit entries', async () => {
    const { service, jwt, audit, stored } = makeService(account());
    const login = await service.login({ email: 'admin@drama.local', password: 'Secret!2026' });
    const code = totpCode(login.secret as string);

    const session = await service.verifyTotp(
      { challengeToken: login.challengeToken as string, code },
      { ip: '127.0.0.1' },
    );
    expect(session.expiresIn).toBe(3600);
    expect(session.user).toMatchObject({ email: 'admin@drama.local', role: 'ADMIN' });
    const payload = await jwt.verifyAsync<{ aud: string; role: string; jti: string }>(
      session.accessToken,
      { audience: ADMIN_ACCESS_AUDIENCE },
    );
    expect(payload).toMatchObject({ aud: 'admin', role: 'ADMIN' });
    expect(stored()?.totpEnabledAt).toBeInstanceOf(Date);
    const actions = audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(
      expect.arrayContaining(['admin.totp_setup_started', 'admin.totp_enrolled', 'admin.login']),
    );
  });

  it('rejects a wrong code, a consumed challenge and a user-signed token', async () => {
    const { service } = makeService(account());
    const login = await service.login({ email: 'admin@drama.local', password: 'Secret!2026' });
    await expect(
      service.verifyTotp({ challengeToken: login.challengeToken as string, code: '000000' }),
    ).rejects.toMatchObject({ response: { code: expect.stringMatching(/INVALID_TOTP_CODE/) } });

    const code = totpCode(login.secret as string);
    await service.verifyTotp({ challengeToken: login.challengeToken as string, code });
    await expect(
      service.verifyTotp({ challengeToken: login.challengeToken as string, code }),
    ).rejects.toMatchObject({ response: { code: 'CHALLENGE_USED' } });

    await expect(
      service.verifyTotp({ challengeToken: 'not.a.jwt-but-long-enough-string', code }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CHALLENGE' } });
  });

  it('logout revokes the token id until its expiry', async () => {
    const { service, redis } = makeService(account());
    const exp = Math.floor(Date.now() / 1000) + 600;
    await service.logout({
      id: 'a',
      email: 'admin@drama.local',
      displayName: 'Admin',
      role: 'ADMIN',
      jti: 'jti-1',
      exp,
    });
    expect(redis.client.set).toHaveBeenCalledWith(
      'admin:revoked:jti-1',
      '1',
      'EX',
      expect.any(Number),
    );
    expect(await service.isRevoked('jti-1')).toBe(true);
    expect(await service.isRevoked('jti-2')).toBe(false);
  });
});

describe('AdminAuthService trusted device (B-13+)', () => {
  it('login with a valid deviceToken opens the session directly (status ok) and audits the method', async () => {
    const sealed = new SecretBox(env.TOTP_ENCRYPTION_KEY).seal('JBSWY3DPEHPK3PXP');
    const { service, devices, audit } = makeService(
      account({ totpSecret: sealed, totpEnabledAt: new Date() }),
    );
    devices.verify.mockResolvedValueOnce({ id: 'dev-1' } as never);
    const res = await service.login({
      email: 'admin@drama.local',
      password: 'Secret!2026',
      deviceToken: 'remembered-device-token',
    });
    expect(res.status).toBe('ok');
    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.user).toMatchObject({ email: 'admin@drama.local' });
    expect(res.challengeToken).toBeUndefined();
    const login = audit.record.mock.calls
      .map((c) => c[0] as { action: string; newValue?: { method?: string } })
      .find((e) => e.action === 'admin.login');
    expect(login?.newValue?.method).toBe('password+device');
  });

  it('an unknown deviceToken is silently ignored and the TOTP flow applies', async () => {
    const sealed = new SecretBox(env.TOTP_ENCRYPTION_KEY).seal('JBSWY3DPEHPK3PXP');
    const { service } = makeService(account({ totpSecret: sealed, totpEnabledAt: new Date() }));
    const res = await service.login({
      email: 'admin@drama.local',
      password: 'Secret!2026',
      deviceToken: 'garbage-token-value',
    });
    expect(res).toEqual({ status: 'totp_required', challengeToken: expect.any(String) });
  });

  it('a deviceToken never bypasses TOTP enrolment on first login', async () => {
    const { service, devices } = makeService(account());
    devices.verify.mockResolvedValue({ id: 'dev-1' } as never);
    const res = await service.login({
      email: 'admin@drama.local',
      password: 'Secret!2026',
      deviceToken: 'remembered-device-token',
    });
    expect(res.status).toBe('totp_setup_required');
    expect(devices.verify).not.toHaveBeenCalled();
  });

  it('verifyTotp with rememberDevice issues a device token', async () => {
    const { service, devices } = makeService(account());
    const login = await service.login({ email: 'admin@drama.local', password: 'Secret!2026' });
    const session = await service.verifyTotp({
      challengeToken: login.challengeToken as string,
      code: totpCode(login.secret as string),
      rememberDevice: true,
    });
    expect(devices.issue).toHaveBeenCalledWith(expect.any(String), expect.anything());
    expect(session.deviceToken).toBe('device-token');
    expect(session.deviceTokenExpiresAt).toBe('2026-11-29T00:00:00.000Z');
  });
});
