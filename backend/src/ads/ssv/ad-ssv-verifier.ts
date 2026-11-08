/**
 * Port de vérification des callbacks SSV (server-side verification) de la régie publicitaire
 * (§8.4 : crédit uniquement sur callback serveur signé). `admob` : signature ECDSA P-256 des
 * paramètres de la requête avec les clés publiques Google ; `fake` : HMAC-SHA256 (dev et tests).
 */
export const AD_SSV_VERIFIER = Symbol('AD_SSV_VERIFIER');

export interface AdSsvVerifier {
  readonly name: 'fake' | 'admob';
  /** `content` = chaîne de requête signée (sans `signature` ni `key_id`), `signature` en base64url. */
  verify(content: string, signature: string, keyId: string | null): Promise<boolean>;
}

/** Paramètres SSV AdMob (https://developers.google.com/admob/android/ssv). */
export interface SsvParams {
  adNetwork: string | null;
  adUnit: string | null;
  customData: string | null;
  keyId: string | null;
  rewardAmount: string | null;
  rewardItem: string | null;
  signature: string | null;
  timestamp: string | null;
  transactionId: string | null;
  userId: string | null;
}

export interface ParsedSsv {
  /**
   * Partie signée : les paramètres autres que `signature`/`key_id`, ordre d'origine conservé,
   * valeurs décodées (voir le commentaire de la fonction ci-dessous pour le pourquoi).
   */
  content: string;
  params: SsvParams;
}

/**
 * Découpe la chaîne de requête brute telle que reçue : AdMob signe les paramètres autres que
 * `signature` et `key_id` (toujours les deux derniers) — mais le contenu signé est la valeur
 * **décodée** de chaque paramètre, pas la sous-chaîne encodée telle qu'elle apparaît dans l'URL.
 * Vérifié contre un vrai callback AdMob (pas seulement contre la doc) : la signature ne correspond
 * qu'après décodage de `custom_data` (`%3A` → `:`) ; un simple découpage du préfixe encodé échoue
 * toujours en production tout en passant les tests, car ceux-ci ne faisaient que re-signer la même
 * chaîne encodée des deux côtés (auto-cohérent, jamais comparé à une vraie signature Google).
 */
export function parseSsvQuery(rawQuery: string): ParsedSsv {
  const query = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  const pairs = query.length > 0 ? query.split('&') : [];
  const content = pairs
    .filter((pair) => {
      const key = pair.slice(0, pair.indexOf('='));
      return key !== 'signature' && key !== 'key_id';
    })
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      return `${key}=${decodeURIComponent(value)}`;
    })
    .join('&');
  const sp = new URLSearchParams(query);
  const get = (k: string) => sp.get(k);
  return {
    content,
    params: {
      adNetwork: get('ad_network'),
      adUnit: get('ad_unit'),
      customData: get('custom_data'),
      keyId: get('key_id'),
      rewardAmount: get('reward_amount'),
      rewardItem: get('reward_item'),
      signature: get('signature'),
      timestamp: get('timestamp'),
      transactionId: get('transaction_id'),
      userId: get('user_id'),
    },
  };
}

/** Sérialise des paramètres dans l'ordre AdMob (utile aux tests et à la régie simulée). */
export function buildSsvQuery(params: Record<string, string | number>): string {
  const order = [
    'ad_network',
    'ad_unit',
    'custom_data',
    'reward_amount',
    'reward_item',
    'timestamp',
    'transaction_id',
    'user_id',
  ];
  const sp = new URLSearchParams();
  for (const key of order) if (params[key] !== undefined) sp.set(key, String(params[key]));
  return sp.toString();
}
