import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type PushMessage, type PushProvider, type PushResult } from '../push.types.js';

/** Fournisseur de développement : chaque push est écrit dans les logs et considéré remis. */
export class LogPushProvider implements PushProvider {
  readonly name = 'log' as const;
  private readonly logger = new Logger('Push');

  send(messages: PushMessage[]): Promise<PushResult[]> {
    return Promise.resolve(
      messages.map((m) => {
        const messageId = `log-${randomUUID()}`;
        this.logger.log(
          `[log] to ${m.token.slice(0, 12)}… « ${m.title} » — ${m.body.slice(0, 80)}${
            m.data ? ` ${JSON.stringify(m.data)}` : ''
          }`,
        );
        return { token: m.token, ok: true, messageId };
      }),
    );
  }
}
