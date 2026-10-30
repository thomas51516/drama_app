import { DEFAULT_LANGUAGE, type SupportedLanguage } from './accept-language.js';

/**
 * Libellés localisés des genres connus (DEF-012, contrat v1.5). `SeriesSummary.genres` reste la liste
 * des clés ; l'application affiche ces libellés (`GET /genres?lang`). Un genre inconnu est affiché tel quel.
 */
export const GENRE_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  romance: { fr: 'Romance', en: 'Romance', es: 'Romance', pt: 'Romance' },
  drame: { fr: 'Drame', en: 'Drama', es: 'Drama', pt: 'Drama' },
  comédie: { fr: 'Comédie', en: 'Comedy', es: 'Comedia', pt: 'Comédia' },
  action: { fr: 'Action', en: 'Action', es: 'Acción', pt: 'Ação' },
  thriller: { fr: 'Thriller', en: 'Thriller', es: 'Thriller', pt: 'Thriller' },
  fantastique: { fr: 'Fantastique', en: 'Fantasy', es: 'Fantasía', pt: 'Fantasia' },
  famille: { fr: 'Famille', en: 'Family', es: 'Familia', pt: 'Família' },
};

/** Alias acceptés (clés sans accent ou en anglais) vers la clé canonique. */
const GENRE_ALIASES: Record<string, string> = {
  comedie: 'comédie',
  comedy: 'comédie',
  drama: 'drame',
  fantasy: 'fantastique',
  family: 'famille',
};

export const KNOWN_GENRES = Object.keys(GENRE_LABELS);

export function canonicalGenre(key: string): string {
  const k = key.trim().toLowerCase();
  return GENRE_ALIASES[k] ?? k;
}

/** Libellé d'un genre dans la langue demandée (repli fr, puis clé capitalisée). */
export function genreLabel(key: string, lang: SupportedLanguage = DEFAULT_LANGUAGE): string {
  const entry = GENRE_LABELS[canonicalGenre(key)];
  if (entry) return entry[lang] ?? entry[DEFAULT_LANGUAGE];
  const k = key.trim();
  return k.charAt(0).toUpperCase() + k.slice(1);
}
