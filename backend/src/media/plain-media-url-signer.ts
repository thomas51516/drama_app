import { type MediaUrlSigner, type SignedMediaUrl } from './media-url-signer.js';

/** Dev / MinIO : URL publique telle quelle, `expiresAt` = maintenant + TTL, aucun contrôle côté serveur de fichiers. */
export class PlainMediaUrlSigner implements MediaUrlSigner {
  readonly name = 'plain' as const;

  constructor(private readonly ttlSeconds: number) {}

  sign(url: string, now = new Date()): SignedMediaUrl {
    return { url, expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString() };
  }
}
