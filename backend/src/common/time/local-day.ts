/**
 * Jour civil dans le fuseau du pays de l'utilisateur (check-in M-40, plafond de pubs M-22, tâches M-41).
 * Pays servis au MVP → fuseau IANA ; tout autre pays (ou inconnu) → UTC. Les fuseaux retenus n'ont pas
 * d'heure d'été, mais le calcul reste générique (décalage mesuré à l'instant considéré).
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  TG: 'Africa/Lome',
  CI: 'Africa/Abidjan',
  SN: 'Africa/Dakar',
  BJ: 'Africa/Porto-Novo',
  BF: 'Africa/Ouagadougou',
  ML: 'Africa/Bamako',
  NE: 'Africa/Niamey',
  GH: 'Africa/Accra',
  NG: 'Africa/Lagos',
};

export const DEFAULT_TIMEZONE = 'UTC';

export function timezoneForCountry(country: string | null | undefined): string {
  if (!country) return DEFAULT_TIMEZONE;
  return COUNTRY_TIMEZONES[country.toUpperCase()] ?? DEFAULT_TIMEZONE;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Jour civil `YYYY-MM-DD` de l'instant dans le fuseau. */
export function dayKey(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Décalage du fuseau (minutes à ajouter à l'UTC) à l'instant donné. */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Instant (UTC) du début d'un jour civil `YYYY-MM-DD` dans le fuseau. */
export function startOfDay(day: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map((v) => Number.parseInt(v, 10));
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // Deux passes : le décalage peut différer entre la supposition UTC et l'instant réel (heure d'été).
  let result = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
  result = new Date(guess.getTime() - offsetMinutes(result, timeZone) * 60_000);
  return result;
}

/** Jour civil suivant / précédent d'une clé `YYYY-MM-DD`. */
export function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map((v) => Number.parseInt(v, 10));
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Début du jour civil courant dans le fuseau. */
export function startOfToday(instant: Date, timeZone: string): Date {
  return startOfDay(dayKey(instant, timeZone), timeZone);
}

/** Début du jour civil suivant dans le fuseau (prochain check-in possible). */
export function startOfTomorrow(instant: Date, timeZone: string): Date {
  return startOfDay(shiftDay(dayKey(instant, timeZone), 1), timeZone);
}

/** Lundi (ISO 8601) de la semaine civile de l'instant, sous forme de clé `YYYY-MM-DD`. */
export function weekKey(instant: Date, timeZone: string): string {
  const today = dayKey(instant, timeZone);
  const [y, m, d] = today.split('-').map((v) => Number.parseInt(v, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  const sinceMonday = (dow + 6) % 7;
  return shiftDay(today, -sinceMonday);
}

/** Début de la semaine civile courante (lundi 00:00) dans le fuseau. */
export function startOfWeek(instant: Date, timeZone: string): Date {
  return startOfDay(weekKey(instant, timeZone), timeZone);
}

/** Début de la semaine civile suivante dans le fuseau. */
export function startOfNextWeek(instant: Date, timeZone: string): Date {
  return startOfDay(shiftDay(weekKey(instant, timeZone), 7), timeZone);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
