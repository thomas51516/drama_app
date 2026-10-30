import { canAfford, spendable, toWalletDto, WalletService } from './wallet.service.js';

const now = new Date('2026-10-30T12:00:00Z');
const USER = '0192f3b2-0000-7000-8000-000000000001';
const soon = new Date('2026-11-05T00:00:00Z');
const later = new Date('2026-12-05T00:00:00Z');

interface LedgerRow {
  id: string;
  userId: string;
  amount: number;
  bucket: 'PURCHASED' | 'BONUS';
  type: string;
  idempotencyKey: string;
  expiresAt: Date | null;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: Date;
}

/**
 * Transaction simulée : un grand livre en mémoire et les requêtes SQL brutes du service
 * (verrou, lots, sommes) rejouées sur ce tableau — la projection `wallets` est ainsi vérifiée
 * contre la somme réelle des lignes.
 */
function makeTx(initial: LedgerRow[] = []) {
  const ledger = [...initial];
  const wallet = { purchasedBalance: 0, bonusBalance: 0 };
  let seq = 0;
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('FOR UPDATE')) return Promise.resolve([{ user_id: USER }]);
      if (sql.includes('GROUP BY expires_at')) {
        const byExpiry = new Map<string, { expires_at: Date | null; remaining: number }>();
        for (const row of ledger.filter((r) => r.bucket === 'BONUS')) {
          const key = row.expiresAt?.toISOString() ?? 'null';
          const cur = byExpiry.get(key) ?? { expires_at: row.expiresAt, remaining: 0 };
          cur.remaining += row.amount;
          byExpiry.set(key, cur);
        }
        return Promise.resolve([...byExpiry.values()].filter((l) => l.remaining !== 0));
      }
      if (sql.includes('GROUP BY bucket')) {
        const sums = { PURCHASED: 0, BONUS: 0 };
        for (const row of ledger) sums[row.bucket] += row.amount;
        return Promise.resolve([
          { bucket: 'PURCHASED', total: sums.PURCHASED },
          { bucket: 'BONUS', total: sums.BONUS },
        ]);
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    coinLedgerEntry: {
      create: vi.fn(({ data }: { data: Omit<LedgerRow, 'id' | 'createdAt'> }) => {
        if (ledger.some((r) => r.idempotencyKey === data.idempotencyKey)) {
          throw new Error('P2002 duplicate idempotency key');
        }
        const row: LedgerRow = { ...data, id: `l${++seq}`, createdAt: now };
        ledger.push(row);
        return Promise.resolve(row);
      }),
      findUnique: vi.fn(({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(ledger.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null),
      ),
    },
    wallet: {
      upsert: vi.fn(
        ({ update }: { update: { purchasedBalance: number; bonusBalance: number } }) => {
          wallet.purchasedBalance = update.purchasedBalance;
          wallet.bonusBalance = update.bonusBalance;
          return Promise.resolve({ userId: USER, ...wallet });
        },
      ),
      findUnique: vi.fn(() => Promise.resolve({ userId: USER, ...wallet })),
    },
  };
  return { tx, ledger, wallet };
}

function makeService(tx: ReturnType<typeof makeTx>['tx']) {
  const prisma = {
    ...tx,
    $transaction: vi.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    user: { findUnique: vi.fn(() => Promise.resolve({ autoUnlock: false })) },
  };
  const settings = { bonusValidityDays: vi.fn(() => Promise.resolve(30)) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new WalletService(prisma as never, settings as never, audit as never);
  return { service, prisma, audit };
}

const row = (
  p: Partial<LedgerRow> & Pick<LedgerRow, 'amount' | 'bucket' | 'idempotencyKey'>,
): LedgerRow => ({
  id: p.idempotencyKey,
  userId: USER,
  type: p.amount > 0 ? (p.bucket === 'BONUS' ? 'BONUS' : 'PURCHASE') : 'UNLOCK',
  expiresAt: null,
  createdAt: now,
  ...p,
});

describe('WalletService ledger projection (S07-BE-01)', () => {
  it('lockAndProject locks the wallet row, expires due bonus lots with EXPIRY rows and syncs the projection', async () => {
    const expired = new Date('2026-10-01T00:00:00Z');
    const { tx, ledger, wallet } = makeTx([
      row({ amount: 100, bucket: 'PURCHASED', idempotencyKey: 'p1' }),
      row({ amount: 20, bucket: 'BONUS', idempotencyKey: 'b-old', expiresAt: expired }),
      row({ amount: 15, bucket: 'BONUS', idempotencyKey: 'b-soon', expiresAt: soon }),
    ]);
    const { service } = makeService(tx);

    const state = await service.lockAndProject(tx as never, USER, now);

    expect(tx.$queryRaw.mock.calls.some((c) => c[0].join('?').includes('FOR UPDATE'))).toBe(true);
    const expiry = ledger.find((r) => r.type === 'EXPIRY');
    expect(expiry).toMatchObject({ amount: -20, bucket: 'BONUS', expiresAt: expired });
    expect(state).toMatchObject({ purchased: 100, bonus: 15 });
    expect(wallet).toEqual({ purchasedBalance: 100, bonusBalance: 15 });
    // Projection = somme du grand livre.
    expect(ledger.reduce((s, r) => s + (r.bucket === 'BONUS' ? r.amount : 0), 0)).toBe(
      wallet.bonusBalance,
    );
  });

  it('debitForUnlock spends bonus lots soonest-expiring first, then purchased coins, in separate ledger rows', async () => {
    const { tx, ledger, wallet } = makeTx([
      row({ amount: 100, bucket: 'PURCHASED', idempotencyKey: 'p1' }),
      row({ amount: 3, bucket: 'BONUS', idempotencyKey: 'b-later', expiresAt: later }),
      row({ amount: 4, bucket: 'BONUS', idempotencyKey: 'b-soon', expiresAt: soon }),
    ]);
    const { service } = makeService(tx);
    const state = await service.lockAndProject(tx as never, USER, now);

    const result = await service.debitForUnlock(tx as never, USER, state, 10, 'unlock-1', now);

    expect(result?.charged).toEqual({ bonus: 7, purchased: 3 });
    const debits = ledger.filter((r) => r.type === 'UNLOCK');
    expect(debits.map((r) => [r.bucket, r.amount, r.expiresAt])).toEqual([
      ['BONUS', -4, soon],
      ['BONUS', -3, later],
      ['PURCHASED', -3, null],
    ]);
    expect(debits.every((r) => r.referenceId === 'unlock-1')).toBe(true);
    expect(new Set(debits.map((r) => r.idempotencyKey)).size).toBe(3);
    expect(wallet).toEqual({ purchasedBalance: 97, bonusBalance: 0 });
    expect(result?.balances.total).toBe(97);
  });

  it('refuses the debit when the balance is insufficient or any bucket is negative (refund)', async () => {
    const { tx } = makeTx([row({ amount: 5, bucket: 'PURCHASED', idempotencyKey: 'p1' })]);
    const { service } = makeService(tx);
    const state = await service.lockAndProject(tx as never, USER, now);
    expect(await service.debitForUnlock(tx as never, USER, state, 10, 'u', now)).toBeNull();

    const negative = { purchased: -50, bonus: 100, lots: [{ expiresAt: null, remaining: 100 }] };
    expect(canAfford(negative, 10, now)).toBe(false);
    expect(
      spendable({ purchased: 20, bonus: 30, lots: [{ expiresAt: soon, remaining: 30 }] }, now),
    ).toBe(50);
  });

  it('creditPurchase writes one PURCHASE and one BONUS row (expiring) and is idempotent per purchase', async () => {
    const { tx, ledger, wallet } = makeTx();
    const { service } = makeService(tx);
    const purchase = { id: 'pur-1', coins: 100, bonusCoins: 10 };

    await service.creditPurchase(tx as never, USER, purchase, now);
    await service.creditPurchase(tx as never, USER, purchase, now);

    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toMatchObject({ type: 'PURCHASE', bucket: 'PURCHASED', amount: 100 });
    expect(ledger[1]).toMatchObject({ type: 'BONUS', bucket: 'BONUS', amount: 10 });
    expect(ledger[1]?.expiresAt?.getTime()).toBe(now.getTime() + 30 * 86_400_000);
    expect(wallet).toEqual({ purchasedBalance: 100, bonusBalance: 10 });
  });

  it('refundPurchase writes negative REFUND rows (bonus on the original lot) and can drive the balance negative', async () => {
    const { tx, ledger, wallet } = makeTx();
    const { service } = makeService(tx);
    const purchase = { id: 'pur-1', coins: 100, bonusCoins: 10 };
    await service.creditPurchase(tx as never, USER, purchase, now);
    await service.debitForUnlock(
      tx as never,
      USER,
      await service.lockAndProject(tx as never, USER, now),
      30,
      'u1',
      now,
    );

    await service.refundPurchase(tx as never, USER, purchase, now);

    const refunds = ledger.filter((r) => r.type === 'REFUND');
    expect(refunds.map((r) => [r.bucket, r.amount])).toEqual([
      ['PURCHASED', -100],
      ['BONUS', -10],
    ]);
    expect(refunds[1]?.expiresAt).toEqual(ledger[1]?.expiresAt);
    expect(wallet.purchasedBalance + wallet.bonusBalance).toBe(-30);
    expect(canAfford(await service.lockAndProject(tx as never, USER, now), 1, now)).toBe(false);
  });
});

describe('WalletService.adjust (B-09 admin credit / debit)', () => {
  const admin = {
    id: 'adm',
    email: 'support@drama.local',
    displayName: 'S',
    role: 'SUPPORT' as const,
    jti: 'j',
    exp: 0,
  };

  it('credits with an ADJUSTMENT row carrying the reason and audits old / new balances', async () => {
    const { tx, ledger } = makeTx([row({ amount: 10, bucket: 'PURCHASED', idempotencyKey: 'p1' })]);
    const { service, audit } = makeService(tx);

    const wallet = await service.adjust(
      USER,
      { amount: 50, bucket: 'BONUS', reason: 'Geste commercial' },
      admin,
      '1.2.3.4',
      now,
    );

    const adj = ledger.find((r) => r.type === 'ADJUSTMENT');
    expect(adj).toMatchObject({
      amount: 50,
      bucket: 'BONUS',
      note: 'Geste commercial',
      referenceType: 'admin_adjustment',
    });
    expect(adj?.expiresAt?.getTime()).toBe(now.getTime() + 30 * 86_400_000);
    expect(wallet).toMatchObject({ purchased: 10, bonus: 50, total: 60 });
    expect(wallet.bonusExpiring).toEqual([
      { amount: 50, expiresAt: adj!.expiresAt!.toISOString() },
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: admin,
        action: 'wallet.adjust',
        targetType: 'wallet',
        targetId: USER,
        oldValue: { purchased: 10, bonus: 0, total: 10 },
        newValue: expect.objectContaining({
          purchased: 10,
          bonus: 50,
          total: 60,
          amount: 50,
          bucket: 'BONUS',
          reason: 'Geste commercial',
        }),
        ip: '1.2.3.4',
      }),
      expect.anything(),
    );
  });

  it('debits bonus coins against existing lots first, the remainder on a never-expiring negative lot', async () => {
    const { tx, ledger, wallet } = makeTx([
      row({ amount: 8, bucket: 'BONUS', idempotencyKey: 'b', expiresAt: soon }),
    ]);
    const { service } = makeService(tx);

    await service.adjust(
      USER,
      { amount: -10, bucket: 'BONUS', reason: 'Fraude' },
      admin,
      undefined,
      now,
    );

    const adj = ledger.filter((r) => r.type === 'ADJUSTMENT');
    expect(adj.map((r) => [r.amount, r.expiresAt])).toEqual([
      [-8, soon],
      [-2, null],
    ]);
    expect(wallet.bonusBalance).toBe(-2);
  });

  it('toWalletDto hides expired and empty lots and sorts the remaining ones by expiry', () => {
    const dto = toWalletDto(
      { purchased: 5, bonus: 7, total: 12 },
      [
        { expiresAt: later, remaining: 2 },
        { expiresAt: new Date('2026-01-01T00:00:00Z'), remaining: 9 },
        { expiresAt: soon, remaining: 5 },
        { expiresAt: null, remaining: 1 },
      ],
      true,
      now,
    );
    expect(dto.autoUnlock).toBe(true);
    expect(dto.bonusExpiring).toEqual([
      { amount: 5, expiresAt: soon.toISOString() },
      { amount: 2, expiresAt: later.toISOString() },
    ]);
  });
});
