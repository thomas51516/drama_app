import { UnlockService } from './unlock.service.js';

const USER = 'user-1';
const episode = { id: 'ep-3', seriesId: 's1', number: 3 } as never;
const series = { id: 's1', freeEpisodeCount: 2, coinCostPerEpisode: 10 };
const now = new Date('2026-10-30T12:00:00Z');

function makeService(opts: {
  existing?: { method: string } | null;
  isVip?: boolean;
  state?: {
    purchased: number;
    bonus: number;
    lots: { expiresAt: Date | null; remaining: number }[];
  };
  debit?: {
    charged: { bonus: number; purchased: number };
    entryIds: string[];
    balances: { total: number };
  } | null;
}) {
  const tx = {
    unlock: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(() => Promise.resolve({ id: 'unlock-1' })),
      update: vi.fn(() => Promise.resolve({})),
    },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    unlock: { findUnique: vi.fn(() => Promise.resolve(opts.existing ?? null)) },
  };
  const wallet = {
    balances: vi.fn(() => Promise.resolve({ purchased: 20, bonus: 5, total: 25 })),
    lockAndProject: vi.fn(() =>
      Promise.resolve(opts.state ?? { purchased: 20, bonus: 5, lots: [] }),
    ),
    debitForUnlock: vi.fn(() =>
      Promise.resolve(
        opts.debit === undefined
          ? { charged: { bonus: 5, purchased: 5 }, entryIds: ['l1', 'l2'], balances: { total: 15 } }
          : opts.debit,
      ),
    ),
  };
  const entitlements = {
    forViewer: vi.fn(() =>
      Promise.resolve({ isVip: opts.isVip ?? false, unlocked: new Set<string>(), country: null }),
    ),
  };
  const service = new UnlockService(prisma as never, wallet as never, entitlements as never);
  return { service, prisma, tx, wallet };
}

describe('UnlockService.unlock decision (S07-BE-02/03)', () => {
  it('a free episode is never charged and never recorded', async () => {
    const { service, tx, wallet } = makeService({});
    const out = await service.unlock(USER, { ...episode, number: 1 } as never, series, {}, now);
    expect(out).toMatchObject({
      kind: 'unlocked',
      method: 'free',
      charged: { bonus: 0, purchased: 0 },
      created: false,
    });
    expect(tx.unlock.create).not.toHaveBeenCalled();
    expect(wallet.lockAndProject).not.toHaveBeenCalled();
  });

  it('an already unlocked episode returns the original method with charged {0,0}', async () => {
    const { service, wallet } = makeService({ existing: { method: 'AD' } });
    const out = await service.unlock(USER, episode, series, {}, now);
    expect(out).toMatchObject({
      kind: 'unlocked',
      method: 'ad',
      charged: { bonus: 0, purchased: 0 },
      created: false,
    });
    expect(wallet.debitForUnlock).not.toHaveBeenCalled();
  });

  it('an active VIP gets a `vip` unlock recorded without any debit', async () => {
    const { service, prisma, wallet } = makeService({ isVip: true });
    const out = await service.unlock(USER, episode, series, { idempotencyKey: 'k' }, now);
    expect(out).toMatchObject({
      kind: 'unlocked',
      method: 'vip',
      charged: { bonus: 0, purchased: 0 },
      created: true,
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(wallet.debitForUnlock).not.toHaveBeenCalled();
  });

  it('debits inside one transaction: lock, re-check, create unlock, debit, link the ledger row', async () => {
    const { service, prisma, tx, wallet } = makeService({});
    const out = await service.unlock(USER, episode, series, { idempotencyKey: 'client-key' }, now);
    expect(out).toMatchObject({
      kind: 'unlocked',
      method: 'coins',
      charged: { bonus: 5, purchased: 5 },
      balance: 15,
      created: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(wallet.lockAndProject.mock.invocationCallOrder[0]).toBeLessThan(
      tx.unlock.create.mock.invocationCallOrder[0],
    );
    expect(tx.unlock.create).toHaveBeenCalledWith({
      data: { userId: USER, episodeId: 'ep-3', method: 'COINS', idempotencyKey: 'client-key' },
    });
    expect(wallet.debitForUnlock).toHaveBeenCalledWith(
      tx,
      USER,
      expect.anything(),
      10,
      'unlock-1',
      now,
    );
    expect(tx.unlock.update).toHaveBeenCalledWith({
      where: { id: 'unlock-1' },
      data: { ledgerEntryId: 'l1' },
    });
  });

  it('an insufficient balance aborts the transaction and reports cost and spendable balance', async () => {
    const { service, tx } = makeService({
      state: { purchased: 3, bonus: 4, lots: [{ expiresAt: null, remaining: 4 }] },
      debit: null,
    });
    const out = await service.unlock(USER, episode, series, {}, now);
    expect(out).toEqual({ kind: 'insufficient', cost: 10, balance: 7 });
    expect(tx.unlock.create).toHaveBeenCalled(); // annulé avec la transaction
  });

  it('a concurrent call that lost the race finds the unlock created under the lock and is not charged', async () => {
    const { service, tx, wallet } = makeService({});
    tx.unlock.findUnique.mockResolvedValueOnce({ method: 'COINS' } as never);
    const out = await service.unlock(USER, episode, series, {}, now);
    expect(out).toMatchObject({
      kind: 'unlocked',
      method: 'coins',
      charged: { bonus: 0, purchased: 0 },
      created: false,
    });
    expect(wallet.debitForUnlock).not.toHaveBeenCalled();
  });
});
