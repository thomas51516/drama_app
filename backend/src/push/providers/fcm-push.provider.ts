import { readFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { type AppConfig } from '../../config/app-config.js';
import { type PushMessage, type PushProvider, type PushResult } from '../push.types.js';

/** Codes FCM signalant un jeton à oublier. */
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);
/** Limite de `sendEach` côté FCM. */
export const FCM_BATCH_LIMIT = 500;

type Messaging = import('firebase-admin/messaging').Messaging;

/**
 * Fournisseur FCM (Firebase Admin SDK). Le SDK n'est chargé et l'application Firebase initialisée
 * qu'au premier envoi, à partir du compte de service (`FIREBASE_SERVICE_ACCOUNT_JSON` ou `_FILE`).
 */
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm' as const;
  private readonly logger = new Logger(FcmPushProvider.name);
  private messaging?: Promise<Messaging>;

  constructor(private readonly config: Pick<AppConfig, 'push'>) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    if (messages.length === 0) return [];
    const messaging = await this.getMessaging();
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += FCM_BATCH_LIMIT) {
      const chunk = messages.slice(i, i + FCM_BATCH_LIMIT);
      const response = await messaging.sendEach(
        chunk.map((m) => ({
          token: m.token,
          notification: { title: m.title, body: m.body },
          data: m.data,
          android: { priority: 'high' as const },
        })),
      );
      response.responses.forEach((r, idx) => {
        const token = chunk[idx].token;
        if (r.success) {
          results.push({ token, ok: true, messageId: r.messageId });
        } else {
          const code = r.error?.code ?? 'unknown';
          results.push({
            token,
            ok: false,
            error: `${code}: ${r.error?.message ?? ''}`.slice(0, 500),
            invalidToken: INVALID_TOKEN_CODES.has(code),
          });
        }
      });
    }
    return results;
  }

  private getMessaging(): Promise<Messaging> {
    this.messaging ??= this.init().catch((err: Error) => {
      this.messaging = undefined;
      throw err;
    });
    return this.messaging;
  }

  private async init(): Promise<Messaging> {
    const { firebaseServiceAccountJson, firebaseServiceAccountFile } = this.config.push;
    const raw =
      firebaseServiceAccountJson ??
      (firebaseServiceAccountFile ? await readFile(firebaseServiceAccountFile, 'utf8') : null);
    if (!raw) throw new Error('Firebase service account is not configured');
    const credentials = JSON.parse(raw) as Record<string, string>;
    const { cert, getApps, initializeApp } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app =
      getApps().find((a) => a.name === 'drama-push') ??
      initializeApp({ credential: cert(credentials) }, 'drama-push');
    this.logger.log(`Firebase Messaging ready (project ${credentials.project_id ?? '?'})`);
    return getMessaging(app);
  }
}
