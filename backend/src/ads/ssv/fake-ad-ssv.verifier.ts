import { createHmac, timingSafeEqual } from 'node:crypto';
import { type AdSsvVerifier } from './ad-ssv-verifier.js';

/**
 * Régie simulée (`AD_PROVIDER=fake`, refusée en production) : `signature = base64url(HMAC-SHA256(secret,
 * contenu signé))`, `key_id` ignoré. L'app de debug et les tests fabriquent le callback avec `signFakeSsv()`.
 */
export class FakeAdSsvVerifier implements AdSsvVerifier {
  readonly name = 'fake' as const;

  constructor(private readonly secret: string) {}

  verify(content: string, signature: string, _keyId: string | null): Promise<boolean> {
    const expected = Buffer.from(signFakeSsv(this.secret, content));
    const given = Buffer.from(signature);
    return Promise.resolve(expected.length === given.length && timingSafeEqual(expected, given));
  }
}

export function signFakeSsv(secret: string, content: string): string {
  return createHmac('sha256', secret).update(content).digest('base64url');
}
