import { ConflictException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { type Env } from '../config/env.schema.js';
import { type User } from '../generated/prisma/client.js';
import { UsersService } from './users.service.js';

const USER_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000c001';

function user(partial: Partial<User> = {}): User & { identities: { provider: 'EMAIL' }[] } {
  return {
    id: USER_ID,
    type: 'REGISTERED',
    status: 'ACTIVE',
    phone: null,
    email: 'awa@example.com',
    passwordHash: 'x',
    displayName: 'Awa',
    country: 'TG',
    language: 'fr',
    deviceId: null,
    isVip: true,
    vipExpiresAt: new Date('2020-01-01T00:00:00Z'),
    autoUnlock: false,
    notificationPreferences: { offers: false },
    deletionScheduledAt: null,
    mergedIntoId: null,
    lastSeenAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date(),
    identities: [{ provider: 'EMAIL' }],
    ...partial,
  };
}

function makeService(current: ReturnType<typeof user>) {
  const tx = {
    user: {
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...current, ...data }),
      ),
    },
    refreshToken: { updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    user: {
      findUnique: vi.fn(() => Promise.resolve(current)),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...current, ...data }),
      ),
    },
    refreshToken: { updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const config = new AppConfig({ ACCOUNT_DELETION_GRACE_DAYS: 30 } as unknown as Env);
  const service = new UsersService(prisma as never, config, audit as never);
  return { service, prisma, tx, audit };
}

describe('UsersService', () => {
  it('getMe maps the contract UserDto (providers, vipStatus expired, preferences)', async () => {
    const { service } = makeService(user());
    await expect(service.getMe(USER_ID)).resolves.toMatchObject({
      id: USER_ID,
      type: 'REGISTERED',
      email: 'awa@example.com',
      providers: ['email'],
      vipStatus: 'expired',
      notificationPreferences: { offers: false },
      deletionScheduledAt: null,
    });
  });

  it('updateMe merges notification preferences field by field and upper-cases the country', async () => {
    const { service, prisma } = makeService(user());
    await service.updateMe(USER_ID, {
      country: 'ci',
      notificationPreferences: { newEpisodes: false },
      displayName: '  Awa K. ',
    });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          country: 'CI',
          displayName: 'Awa K.',
          notificationPreferences: { offers: false, newEpisodes: false },
        },
      }),
    );
  });

  it('deleteMe schedules the anonymisation 30 days later, revokes tokens and audits', async () => {
    const { service, tx, audit } = makeService(user());
    const before = Date.now();
    const result = await service.deleteMe(USER_ID, '1.2.3.4');
    const scheduled = new Date(result.scheduledFor).getTime();
    expect(scheduled - before).toBeGreaterThanOrEqual(30 * 86_400_000 - 5_000);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'DELETION_PENDING', deletionScheduledAt: expect.any(Date) },
      }),
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.delete_request', actorLabel: `user:${USER_ID}` }),
      tx,
    );
  });

  it('deleteMe is idempotent while pending and refuses non-active accounts', async () => {
    const scheduled = new Date('2026-11-28T00:00:00Z');
    const pending = makeService(
      user({ status: 'DELETION_PENDING', deletionScheduledAt: scheduled }),
    );
    await expect(pending.service.deleteMe(USER_ID)).resolves.toEqual({
      scheduledFor: scheduled.toISOString(),
    });
    expect(pending.prisma.$transaction).not.toHaveBeenCalled();

    const blocked = makeService(user({ status: 'BLOCKED' }));
    await expect(blocked.service.deleteMe(USER_ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancelDeletion restores an ACTIVE account within the grace period', async () => {
    const { service, tx } = makeService(
      user({ status: 'DELETION_PENDING', deletionScheduledAt: new Date('2026-11-28T00:00:00Z') }),
    );
    const restored = await service.cancelDeletion(USER_ID);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE', deletionScheduledAt: null } }),
    );
    expect(restored.status).toBe('ACTIVE');

    const merged = makeService(user({ status: 'MERGED' }));
    await expect(merged.service.cancelDeletion(USER_ID)).rejects.toMatchObject({
      response: { code: 'DELETION_NOT_PENDING' },
    });
  });
});
