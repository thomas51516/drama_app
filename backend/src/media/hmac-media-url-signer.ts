import { createHmac, timingSafeEqual } from 'node:crypto';
import { type MediaUrlSigner, type SignedMediaUrl } from './media-url-signer.js';

/**
 * Signature HMAC-SHA256 sur le préfixe du manifeste (contrat public v1.2) :
 * `?token=<base64url(hmac-sha256(secret, path + expires))>&expires=<epoch>` où `path` est le
 * chemin du dossier contenant le manifeste (`/drama-media/hls/<episodeId>/`), ce qui couvre les
 * segments et sous-manifestes du même dossier. Compatible avec l'authentification par jeton des
 * CDN de type Bunny ou KeyCDN configurés sur le même secret.
 */
export class HmacMediaUrlSigner implements MediaUrlSigner {
  readonly name = 'hmac' as const;

  constructor(
    private readonly key: string,
    private readonly ttlSeconds: number,
  ) {
    if (!key) throw new Error('HmacMediaUrlSigner requires a signing key');
  }

  sign(url: string, now = new Date()): SignedMediaUrl {
    const target = new URL(url);
    const expires = Math.floor(now.getTime() / 1000) + this.ttlSeconds;
    const token = computeMediaToken(this.key, signedPathOf(target.pathname), expires);
    target.searchParams.set('token', token);
    target.searchParams.set('expires', String(expires));
    return { url: target.toString(), expiresAt: new Date(expires * 1000).toISOString() };
  }

  /** Vérifie une URL signée par `sign()` (tests, passerelle maison) : jeton valide et non expiré. */
  verify(url: string, now = new Date()): boolean {
    return verifyMediaUrl(this.key, url, now);
  }
}

/** Dossier du fichier demandé, avec la barre oblique finale : `/a/b/master.m3u8` → `/a/b/`. */
export function signedPathOf(pathname: string): string {
  const idx = pathname.lastIndexOf('/');
  return idx < 0 ? '/' : pathname.slice(0, idx + 1);
}

export function computeMediaToken(key: string, path: string, expires: number): string {
  return createHmac('sha256', key).update(`${path}${expires}`).digest('base64url');
}

export function verifyMediaUrl(key: string, url: string, now = new Date()): boolean {
  const target = new URL(url);
  const token = target.searchParams.get('token');
  const expires = Number(target.searchParams.get('expires'));
  if (!token || !Number.isInteger(expires)) return false;
  if (expires * 1000 <= now.getTime()) return false;
  const expected = computeMediaToken(key, signedPathOf(target.pathname), expires);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
