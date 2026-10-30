import { type User } from '../../generated/prisma/client.js';
import { AccountMergeService } from './account-merge.service.js';

const GUEST_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000b001';
const TARGET_ID = '0192f1f0-8a5b-7c3d-9e1f-00000000b002';

function user(partial: Partial<User> = {}): User {
  return {
    id: GUEST_ID,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function makeTx(guestWallet: { purchasedBalance: number; bonusBalance: number }) {
  const ledger: Record<string, unknown>[] = [];
  const walletUpdates: unknown[] = [];
  const userUpdates: Record<string, unknown>[] = [];
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    $queryRaw: vi.fn(() => Promise.resolve([{ series_id: 'series-dup' }])),
    watchProgress: { deleteMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    favorite: { deleteMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    series: { update: vi.fn(() => Promise.resolve({})) },
    like: { updateMany: vi.fn(() => Promise.resolve({ count: 2 })) },
    unlock: {
      findMany: vi.fn(() => Promise.resolve([{ episodeId: 'ep-owned' }])),
      deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
      updateMany: vi.fn(() => Promise.resolve({ count: 3 })),
    },
    purchase: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    subscription: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    wallet: {
      findUnique: vi.fn(() => Promise.resolve({ userId: GUEST_ID, ...guestWallet })),
      upsert: vi.fn(() => Promise.resolve({})),
      update: vi.fn((args: unknown) => {
        walletUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    coinLedgerEntry: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
        return Promise.resolve(data);
      }),
      aggregate: vi.fn(() =>
        Promise.resolve({ _min: { expiresAt: new Date('2027-01-01T00:00:00Z') } }),
      ),
    },
    user: {
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        userUpdates.push({ id: args.where.id, ...args.data });
        return Promise.resolve({});
      }),
    },
    userIdentity: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) },
    refreshToken: { updateMany: vi.fn(() => Promise.resolve({ count: 2 })) },
  };
  return { tx, ledger, walletUpdates, userUpdates };
}

describe('AccountMergeService', () => {
  it('transfers the guest balance with paired MERGE ledger rows and updates both wallets', async () => {
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const { tx, ledger, walletUpdates, userUpdates } = makeTx({
      purchasedBalance: 40,
      bonusBalance: 15,
    });
    const service = new AccountMergeService(audit as never);

    const summary = await service.merge(
      tx as never,
      user(),
      user({ id: TARGET_ID, type: 'REGISTERED' }),
      '1.2.3.4',
    );

    expect(summary).toMatchObject({
      guestId: GUEST_ID,
      targetId: TARGET_ID,
      purchasedTransferred: 40,
      bonusTransferred: 15,
      likesMoved: 2,
      unlocksMoved: 3,
    });
    // 2 lignes par bucket : débit invité / crédit cible, somme nulle, clés d'idempotence distinctes.
    expect(ledger).toHaveLength(4);
    expect(ledger.reduce((sum, l) => sum + (l.amount as number), 0)).toBe(0);
    expect(new Set(ledger.map((l) => l.idempotencyKey)).size).toBe(4);
    expect(ledger.every((l) => l.type === 'MERGE' && l.referenceType === 'account_merge')).toBe(
      true,
    );
    const bonusIn = ledger.find((l) => l.bucket === 'BONUS' && (l.amount as number) > 0);
    expect(bonusIn).toMatchObject({
      userId: TARGET_ID,
      amount: 15,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    expect(walletUpdates).toEqual(
      expect.arrayContaining([
        { where: { userId: GUEST_ID }, data: { purchasedBalance: { decrement: 40 } } },
        { where: { userId: TARGET_ID }, data: { purchasedBalance: { increment: 40 } } },
        { where: { userId: GUEST_ID }, data: { bonusBalance: { decrement: 15 } } },
        { where: { userId: TARGET_ID }, data: { bonusBalance: { increment: 15 } } },
      ]),
    );
    // Doublon de « J'aime » retiré du compteur ; déblocage déjà possédé non dupliqué.
    expect(tx.series.update).toHaveBeenCalledWith({
      where: { id: 'series-dup' },
      data: { likesCount: { decrement: 1 } },
    });
    expect(tx.unlock.deleteMany).toHaveBeenCalledWith({
      where: { userId: GUEST_ID, episodeId: { in: ['ep-owned'] } },
    });
    // Invité : jetons révoqués, statut MERGED ; audit avec l'utilisateur pour auteur.
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: GUEST_ID, revokedAt: null } }),
    );
    expect(userUpdates).toContainEqual({ id: GUEST_ID, status: 'MERGED', mergedIntoId: TARGET_ID });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.merge',
        targetType: 'user',
        targetId: TARGET_ID,
        actorLabel: `user:${TARGET_ID}`,
        ip: '1.2.3.4',
      }),
      tx,
    );
  });

  it('writes no ledger row when the guest wallet is empty and keeps the best VIP', async () => {
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const { tx, ledger, userUpdates } = makeTx({ purchasedBalance: 0, bonusBalance: 0 });
    const service = new AccountMergeService(audit as never);
    const later = new Date('2027-06-01T00:00:00Z');

    await service.merge(
      tx as never,
      user({ isVip: true, vipExpiresAt: later }),
      user({
        id: TARGET_ID,
        type: 'REGISTERED',
        isVip: true,
        vipExpiresAt: new Date('2026-12-01T00:00:00Z'),
      }),
    );

    expect(ledger).toHaveLength(0);
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(userUpdates).toContainEqual(
      expect.objectContaining({ id: TARGET_ID, isVip: true, vipExpiresAt: later }),
    );
  });

  it('refuses to merge a user into itself', async () => {
    const service = new AccountMergeService({ record: vi.fn() } as never);
    await expect(service.merge({} as never, user(), user())).rejects.toThrow();
  });
});
