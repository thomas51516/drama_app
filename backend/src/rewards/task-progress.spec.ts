import {
  periodExpiresAt,
  periodKey,
  type ProgressSignals,
  taskProgress,
  taskStatus,
} from './task-progress.js';

const base: ProgressSignals = {
  completedToday: 0,
  completedThisWeek: 0,
  pushDevices: 0,
  pushPermissionEvents: 0,
  shareEvents: 0,
  favorites: 0,
  profile: { displayName: null, language: 'fr', country: null },
};

describe('task progress (M-41)', () => {
  it('derives each task from server-side signals', () => {
    expect(taskProgress('watch_3_episodes', { ...base, completedToday: 2 })).toBe(2);
    expect(taskProgress('watch_10_episodes', { ...base, completedThisWeek: 11 })).toBe(11);
    expect(taskProgress('enable_notifications', base)).toBe(0);
    expect(taskProgress('enable_notifications', { ...base, pushDevices: 1 })).toBe(1);
    expect(taskProgress('enable_notifications', { ...base, pushPermissionEvents: 1 })).toBe(1);
    expect(taskProgress('share_series', { ...base, shareEvents: 3 })).toBe(3);
    expect(taskProgress('complete_profile', base)).toBe(0);
    expect(
      taskProgress('complete_profile', {
        ...base,
        profile: { displayName: 'Ama', language: 'fr', country: 'TG' },
      }),
    ).toBe(1);
    expect(taskProgress('add_favorite', { ...base, favorites: 1 })).toBe(1);
    expect(taskProgress('unknown', base)).toBe(0);
  });

  it('computes period keys and expiry in the user timezone', () => {
    const now = new Date('2026-10-30T23:30:00Z'); // vendredi 30 UTC, samedi 31 à Lagos
    expect(periodKey('DAY', now, 'Africa/Lagos')).toBe('2026-10-31');
    expect(periodKey('WEEK', now, 'Africa/Lagos')).toBe('2026-10-26');
    expect(periodKey('ONCE', now, 'Africa/Lagos')).toBe('once');
    expect(periodExpiresAt('DAY', now, 'Africa/Lagos')?.toISOString()).toBe(
      '2026-10-31T23:00:00.000Z',
    );
    expect(periodExpiresAt('WEEK', now, 'UTC')?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(periodExpiresAt('ONCE', now, 'UTC')).toBeNull();
  });

  it('maps progress to a status', () => {
    expect(taskStatus(1, 3, false)).toBe('AVAILABLE');
    expect(taskStatus(3, 3, false)).toBe('CLAIMABLE');
    expect(taskStatus(5, 3, true)).toBe('CLAIMED');
  });
});
