/**
 * Préparation d'une requête de recherche (S05-BE-06) côté application : normalisation sans accent,
 * requête préfixe pour le dictionnaire `simple` et motif LIKE pour les suggestions de titres.
 * Le dictionnaire `french` (racinisation) est appliqué côté PostgreSQL via `websearch_to_tsquery`.
 */
export interface PreparedSearch {
  /** Texte nettoyé transmis à `websearch_to_tsquery('french', f_unaccent(...))`. */
  text: string;
  /** Requête `to_tsquery('simple', ...)` de type `secr:* & lag:*` ; vide si aucun terme. */
  prefixQuery: string;
  /** Préfixe LIKE échappé (`%`, `_`, `\\`) en minuscules sans accent. */
  likePrefix: string;
  terms: string[];
}

/** Supprime les diacritiques et met en minuscules (équivalent applicatif de `unaccent` + `lower`). */
export function normalizeSearchText(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function prepareSearch(raw: string): PreparedSearch {
  const text = normalizeSearchText(raw).slice(0, 100);
  const terms = (text.match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 0).slice(0, 8);
  return {
    text,
    terms,
    prefixQuery: terms.map((t) => `${t}:*`).join(' & '),
    likePrefix: escapeLike(text),
  };
}
