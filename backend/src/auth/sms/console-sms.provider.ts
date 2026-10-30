import { Logger } from '@nestjs/common';
import { type SmsProvider } from './sms-provider.js';

/** Dev / tests : le SMS est écrit dans les logs de l'API (le code est aussi dans Redis `otp:<requestId>`). */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console' as const;
  private readonly logger = new Logger('SMS');

  send(to: string, text: string): Promise<void> {
    this.logger.log(`[console] to ${to}: ${text}`);
    return Promise.resolve();
  }
}
