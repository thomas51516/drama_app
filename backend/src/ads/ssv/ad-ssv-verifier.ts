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
  /** Partie signée : tout ce qui précède `&signature=` (ordre d'origine conservé). */
  content: string;
  params: SsvParams;
}

/**
 * Découpe la chaîne de requête brute telle que reçue : AdMob signe la requête sans les paramètres
 * `signature` et `key_id`, qui sont toujours les derniers ; le contenu signé est donc le préfixe
 * jusqu'à `signature=` exclu.
 */
export function parseSsvQuery(rawQuery: string): ParsedSsv {
  const query = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  const idx = query.search(/(^|&)signature=/);
  const content = idx <= 0 ? (idx === 0 ? '' : query) : query.slice(0, idx);
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
