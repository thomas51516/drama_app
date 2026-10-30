/** Jeton d'injection du port de signature des URLs média (S04-BE-02). */
export const MEDIA_URL_SIGNER = Symbol('MEDIA_URL_SIGNER');

export interface SignedMediaUrl {
  url: string;
  /** Expiration ISO 8601 ; le client redemande `/play` ensuite ou sur un 403 du CDN. */
  expiresAt: string;
}

/**
 * Port de signature des URLs de lecture (manifeste `/play`, extrait `/feed`).
 * Implémentations : `plain` (dev MinIO : URL inchangée) et `hmac` (jeton compatible CDN).
 * Les vignettes, affiches et sous-titres ne sont jamais signés.
 */
export interface MediaUrlSigner {
  readonly name: 'plain' | 'hmac';
  sign(url: string, now?: Date): SignedMediaUrl;
}
