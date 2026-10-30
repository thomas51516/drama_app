import { shiftDay } from '../common/time/local-day.js';

export const CHECKIN_CYCLE_DAYS = 7;

export interface CheckinSettings {
  scale: number[];
  resetOnMiss: boolean;
}

export interface LastCheckin {
  /** Jour civil `YYYY-MM-DD` dans le fuseau du pays. */
  day: string;
  /** Jour du cycle crédité (1 à 7). */
  streakDay: number;
}

export interface CheckinPlan {
  claimedToday: boolean;
  /** Jour du cycle atteint par la série en cours (0 si aucune série en cours). */
  streakDay: number;
  /** Jour du cycle que le prochain check-in créditera (1 à 7). */
  nextDay: number;
  /** Pièces du prochain check-in. */
  coins: number;
}

/**
 * Barème sur 7 jours (M-40) : chaque jour consécutif avance d'un cran, le 8e revient au jour 1.
 * Jour manqué : retour au jour 1 si `resetOnMiss`, sinon la série reprend là où elle en était.
 */
export function planCheckin(
  last: LastCheckin | null,
  today: string,
  settings: CheckinSettings,
): CheckinPlan {
  const coinsFor = (day: number) => settings.scale[day - 1] ?? 0;
  if (!last) return { claimedToday: false, streakDay: 0, nextDay: 1, coins: coinsFor(1) };
  const advance = (last.streakDay % CHECKIN_CYCLE_DAYS) + 1;
  if (last.day === today) {
    return {
      claimedToday: true,
      streakDay: last.streakDay,
      nextDay: advance,
      coins: coinsFor(advance),
    };
  }
  if (last.day === shiftDay(today, -1)) {
    return {
      claimedToday: false,
      streakDay: last.streakDay,
      nextDay: advance,
      coins: coinsFor(advance),
    };
  }
  if (settings.resetOnMiss) {
    return { claimedToday: false, streakDay: 0, nextDay: 1, coins: coinsFor(1) };
  }
  return {
    claimedToday: false,
    streakDay: last.streakDay,
    nextDay: advance,
    coins: coinsFor(advance),
  };
}
