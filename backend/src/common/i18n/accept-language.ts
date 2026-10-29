/** Langues des interfaces (CLAUDE.md racine) : français d'abord, puis EN, ES, PT. */
export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'pt'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

/**
 * Choisit la langue d'affichage à partir d'un en-tête `Accept-Language` (RFC 9110 §12.5.4) :
 * les étiquettes sont classées par poids `q`, la première dont la langue de base est supportée gagne.
 * Repli : `fr`.
 */
export function pickLanguage(
  header: string | undefined | null,
  fallback: SupportedLanguage = DEFAULT_LANGUAGE,
): SupportedLanguage {
  if (!header) return fallback;
  const candidates = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      const weight = q === undefined ? 1 : Number.parseFloat(q);
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((c) => c.tag.length > 0 && c.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of candidates) {
    if (tag === '*') return fallback;
    const base = tag.split('-')[0] ?? tag;
    if (isSupportedLanguage(base)) return base;
  }
  return fallback;
}

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Code pays ISO 3166-1 alpha-2 normalisé (majuscules) ou `null` si l'en-tête est absent / invalide. */
export function normalizeCountry(value: string | undefined | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
