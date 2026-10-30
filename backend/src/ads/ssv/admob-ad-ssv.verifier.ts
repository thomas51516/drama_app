import { createPublicKey, type KeyObject, verify as verifySignature } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { type AdSsvVerifier } from './ad-ssv-verifier.js';

export const ADMOB_KEYS_CACHE_MS = 24 * 3_600_000;

interface AdmobKeysDocument {
  keys?: { keyId: number | string; pem?: string; base64?: string }[];
}

export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Vérification SSV AdMob (https://developers.google.com/admob/android/ssv) : signature ECDSA P-256
 * (DER, base64url) du contenu de la requête, clé publique désignée par `key_id` parmi les clés
 * publiées par Google (`verifier-keys.json`, cache 24 h, rechargées si l'identifiant est inconnu).
 */
export class AdmobAdSsvVerifier implements AdSsvVerifier {
  readonly name = 'admob' as const;
  private readonly logger = new Logger(AdmobAdSsvVerifier.name);
  private keys = new Map<string, KeyObject>();
  private loadedAt = 0;

  constructor(
    private readonly keysUrl: string,
    private readonly fetchImpl: FetchLike = (url) => fetch(url),
    private readonly now: () => number = Date.now,
  ) {}

  async verify(content: string, signature: string, keyId: string | null): Promise<boolean> {
    if (!keyId) return false;
    let key = await this.keyFor(keyId, false);
    if (!key) key = await this.keyFor(keyId, true);
    if (!key) {
      this.logger.warn(`AdMob SSV: unknown key_id ${keyId}`);
      return false;
    }
    let sig: Buffer;
    try {
      sig = Buffer.from(signature, 'base64url');
    } catch {
      return false;
    }
    try {
      return verifySignature(
        'sha256',
        Buffer.from(content, 'utf8'),
        { key, dsaEncoding: 'der' },
        sig,
      );
    } catch (err) {
      this.logger.warn(`AdMob SSV: signature check error: ${(err as Error).message}`);
      return false;
    }
  }

  /** Remplace les clés (tests, rotation manuelle). */
  setKeys(keys: { keyId: string; pem: string }[], loadedAt = this.now()): void {
    this.keys = new Map(keys.map((k) => [k.keyId, createPublicKey(k.pem)]));
    this.loadedAt = loadedAt;
  }

  private async keyFor(keyId: string, force: boolean): Promise<KeyObject | null> {
    const stale = this.now() - this.loadedAt > ADMOB_KEYS_CACHE_MS;
    if (force || stale || this.keys.size === 0) await this.reload();
    return this.keys.get(keyId) ?? null;
  }

  private async reload(): Promise<void> {
    try {
      const res = await this.fetchImpl(this.keysUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doc = (await res.json()) as AdmobKeysDocument;
      const next = new Map<string, KeyObject>();
      for (const k of doc.keys ?? []) {
        const pem = k.pem ?? (k.base64 ? spkiToPem(k.base64) : null);
        if (pem) next.set(String(k.keyId), createPublicKey(pem));
      }
      this.keys = next;
      this.loadedAt = this.now();
      this.logger.log(`AdMob SSV: ${next.size} verifier key(s) loaded`);
    } catch (err) {
      this.logger.error(`AdMob SSV: cannot load verifier keys: ${(err as Error).message}`);
    }
  }
}

function spkiToPem(base64: string): string {
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}
