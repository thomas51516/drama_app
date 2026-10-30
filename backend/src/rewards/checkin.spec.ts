import { planCheckin } from './checkin.js';

const settings = { scale: [5, 5, 10, 10, 15, 20, 30], resetOnMiss: true };

describe('planCheckin (M-40, barème sur 7 jours)', () => {
  it('starts at day 1 for a new user', () => {
    expect(planCheckin(null, '2026-10-30', settings)).toEqual({
      claimedToday: false,
      streakDay: 0,
      nextDay: 1,
      coins: 5,
    });
  });

  it('advances one step after a consecutive day', () => {
    expect(planCheckin({ day: '2026-10-29', streakDay: 2 }, '2026-10-30', settings)).toEqual({
      claimedToday: false,
      streakDay: 2,
      nextDay: 3,
      coins: 10,
    });
  });

  it('reports claimedToday and the day already credited', () => {
    expect(planCheckin({ day: '2026-10-30', streakDay: 7 }, '2026-10-30', settings)).toMatchObject({
      claimedToday: true,
      streakDay: 7,
      nextDay: 1,
      coins: 5,
    });
  });

  it('wraps from day 7 back to day 1', () => {
    expect(planCheckin({ day: '2026-10-29', streakDay: 7 }, '2026-10-30', settings)).toMatchObject({
      nextDay: 1,
      coins: 5,
    });
  });

  it('resets after a missed day when resetOnMiss is on, keeps the streak otherwise', () => {
    const last = { day: '2026-10-28', streakDay: 4 };
    expect(planCheckin(last, '2026-10-30', settings)).toEqual({
      claimedToday: false,
      streakDay: 0,
      nextDay: 1,
      coins: 5,
    });
    expect(planCheckin(last, '2026-10-30', { ...settings, resetOnMiss: false })).toEqual({
      claimedToday: false,
      streakDay: 4,
      nextDay: 5,
      coins: 15,
    });
  });

  it('handles month boundaries as consecutive days', () => {
    expect(planCheckin({ day: '2026-10-31', streakDay: 1 }, '2026-11-01', settings).nextDay).toBe(
      2,
    );
  });
});
