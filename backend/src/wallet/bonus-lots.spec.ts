import { planBonusConsumption, spendableLots } from './bonus-lots.js';

const now = new Date('2026-10-30T12:00:00Z');
const d = (iso: string) => new Date(iso);

describe('planBonusConsumption (bonus first, soonest-expiring first — §3, S07-BE-02)', () => {
  const lots = [
    { expiresAt: null, remaining: 50 },
    { expiresAt: d('2026-12-01T00:00:00Z'), remaining: 5 },
    { expiresAt: d('2026-11-01T00:00:00Z'), remaining: 8 },
    { expiresAt: d('2026-10-01T00:00:00Z'), remaining: 100 }, // expiré : jamais consommé
    { expiresAt: d('2026-11-15T00:00:00Z'), remaining: 0 }, // vide
  ];

  it('orders spendable lots by expiry, never-expiring last, skips expired and empty lots', () => {
    expect(spendableLots(lots, now).map((l) => l.remaining)).toEqual([8, 5, 50]);
  });

  it('consumes the soonest-expiring lot first and reports the purchased remainder', () => {
    expect(planBonusConsumption(lots, 10, now)).toEqual({
      debits: [
        { expiresAt: d('2026-11-01T00:00:00Z'), amount: 8 },
        { expiresAt: d('2026-12-01T00:00:00Z'), amount: 2 },
      ],
      remainder: 0,
    });
    expect(planBonusConsumption(lots, 70, now)).toEqual({
      debits: [
        { expiresAt: d('2026-11-01T00:00:00Z'), amount: 8 },
        { expiresAt: d('2026-12-01T00:00:00Z'), amount: 5 },
        { expiresAt: null, amount: 50 },
      ],
      remainder: 7,
    });
  });

  it('takes everything from purchased coins when no bonus is spendable', () => {
    expect(planBonusConsumption([], 10, now)).toEqual({ debits: [], remainder: 10 });
  });
});
