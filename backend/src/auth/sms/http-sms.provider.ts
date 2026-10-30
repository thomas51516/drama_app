import { ServiceUnavailableException } from '@nestjs/common';
import { type SmsProvider } from './sms-provider.js';

/**
 * Passerelle HTTP générique : `POST SMS_HTTP_URL` avec `{ to, text }` en JSON et
 * `Authorization: Bearer SMS_HTTP_TOKEN`. À adapter au fournisseur retenu (S02-PM-01) si son API diffère.
 */
export class HttpSmsProvider implements SmsProvider {
  readonly name = 'http' as const;

  constructor(
    private readonly url: string,
    private readonly token: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, text: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({ to, text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new ServiceUnavailableException({
        code: 'SMS_DELIVERY_FAILED',
        message: `SMS gateway unreachable: ${(err as Error).message}`,
      });
    }
    if (!res.ok) {
      throw new ServiceUnavailableException({
        code: 'SMS_DELIVERY_FAILED',
        message: `SMS gateway answered ${res.status}`,
      });
    }
  }
}
