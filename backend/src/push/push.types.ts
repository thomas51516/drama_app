export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export const PUSH_QUEUE = 'push';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Charge utile de routage (valeurs chaîne uniquement, contrainte FCM). */
  data?: Record<string, string>;
}

export interface PushResult {
  token: string;
  ok: boolean;
  messageId?: string;
  error?: string;
  /** Jeton périmé ou inconnu du fournisseur : l'appareil est supprimé. */
  invalidToken?: boolean;
}

/**
 * Port « fournisseur de push » (M-54, contrat v1.3) : `log` (dev, journal + `push_deliveries`)
 * et `fcm` (Firebase Admin SDK, initialisé à la première utilisation).
 */
export interface PushProvider {
  readonly name: 'log' | 'fcm';
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/** Types de notification exposés dans `GET /me/notifications`. */
export const NOTIFICATION_TYPES = [
  'new_episode',
  'support_reply',
  'campaign',
  'offer',
  'checkin_reminder',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface CampaignJobData {
  campaignId: string;
}
