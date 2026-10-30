import { dayKey, startOfNextWeek, startOfTomorrow, weekKey } from '../common/time/local-day.js';
import { type RewardTaskPeriod } from '../generated/prisma/client.js';
import { type RewardTaskStatus } from './dto/rewards.dto.js';

/** Signaux serveur utilisés pour calculer la progression des tâches (M-41). */
export interface ProgressSignals {
  completedToday: number;
  completedThisWeek: number;
  pushDevices: number;
  pushPermissionEvents: number;
  shareEvents: number;
  favorites: number;
  profile: { displayName: string | null; language: string | null; country: string | null };
}

export function taskProgress(key: string, s: ProgressSignals): number {
  switch (key) {
    case 'watch_3_episodes':
      return s.completedToday;
    case 'watch_10_episodes':
      return s.completedThisWeek;
    case 'enable_notifications':
      return s.pushDevices > 0 || s.pushPermissionEvents > 0 ? 1 : 0;
    case 'share_series':
      return s.shareEvents;
    case 'complete_profile':
      return s.profile.displayName?.trim() && s.profile.language && s.profile.country ? 1 : 0;
    case 'add_favorite':
      return s.favorites;
    default:
      return 0;
  }
}

/** Clé de période d'une réclamation : jour civil, lundi de la semaine, ou `once`. */
export function periodKey(period: RewardTaskPeriod, now: Date, timeZone: string): string {
  switch (period) {
    case 'DAY':
      return dayKey(now, timeZone);
    case 'WEEK':
      return weekKey(now, timeZone);
    default:
      return 'once';
  }
}

export function periodExpiresAt(
  period: RewardTaskPeriod,
  now: Date,
  timeZone: string,
): Date | null {
  switch (period) {
    case 'DAY':
      return startOfTomorrow(now, timeZone);
    case 'WEEK':
      return startOfNextWeek(now, timeZone);
    default:
      return null;
  }
}

export function taskStatus(progress: number, target: number, claimed: boolean): RewardTaskStatus {
  if (claimed) return 'CLAIMED';
  return progress >= target ? 'CLAIMABLE' : 'AVAILABLE';
}
