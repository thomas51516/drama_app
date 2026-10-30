import {
  dayKey,
  offsetMinutes,
  shiftDay,
  startOfDay,
  startOfTomorrow,
  startOfWeek,
  timezoneForCountry,
  weekKey,
} from './local-day.js';

describe('local-day (fuseau du pays, M-40)', () => {
  it('maps served countries to their IANA zone and defaults to UTC', () => {
    expect(timezoneForCountry('TG')).toBe('Africa/Lome');
    expect(timezoneForCountry('ng')).toBe('Africa/Lagos');
    expect(timezoneForCountry('FR')).toBe('UTC');
    expect(timezoneForCountry(null)).toBe('UTC');
  });

  it('computes the civil day in Lagos (UTC+1) across midnight', () => {
    const lateUtc = new Date('2026-10-30T23:30:00Z');
    expect(dayKey(lateUtc, 'UTC')).toBe('2026-10-30');
    expect(dayKey(lateUtc, 'Africa/Lagos')).toBe('2026-10-31');
    expect(offsetMinutes(lateUtc, 'Africa/Lagos')).toBe(60);
    expect(offsetMinutes(lateUtc, 'Africa/Lome')).toBe(0);
  });

  it('gives the UTC instant of the start of a day and of tomorrow', () => {
    expect(startOfDay('2026-10-31', 'Africa/Lagos').toISOString()).toBe('2026-10-30T23:00:00.000Z');
    expect(startOfDay('2026-10-31', 'UTC').toISOString()).toBe('2026-10-31T00:00:00.000Z');
    const now = new Date('2026-10-30T23:30:00Z');
    expect(startOfTomorrow(now, 'Africa/Lagos').toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(startOfTomorrow(now, 'UTC').toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });

  it('shifts day keys across month and year boundaries', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDay('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('starts weeks on Monday', () => {
    // 2026-10-30 is a Friday.
    expect(weekKey(new Date('2026-10-30T12:00:00Z'), 'UTC')).toBe('2026-10-26');
    expect(weekKey(new Date('2026-10-26T00:10:00Z'), 'UTC')).toBe('2026-10-26');
    expect(weekKey(new Date('2026-10-25T23:50:00Z'), 'UTC')).toBe('2026-10-19');
    expect(startOfWeek(new Date('2026-10-30T12:00:00Z'), 'Africa/Lagos').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
  });
});
