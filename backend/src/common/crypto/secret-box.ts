import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * Chiffrement symétrique au repos (AES-256-GCM) des secrets TOTP (schéma `admin_accounts.totp_secret`).
 * La clé de 32 octets est dérivée de `TOTP_ENCRYPTION_KEY` par SHA-256 ; format stocké :
 * `v1:<iv b64url>:<tag b64url>:<ciphertext b64url>`. Un secret en clair n'est jamais écrit en base.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(passphrase: string) {
    this.key = createHash('sha256').update(passphrase).digest();
  }

  seal(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, b64(iv), b64(tag), b64(ciphertext)].join(':');
  }

  open(sealed: string): string {
    const [version, iv, tag, ciphertext] = sealed.split(':');
    if (version !== VERSION || !iv || !tag || !ciphertext) {
      throw new Error('Unsupported sealed secret format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

function b64(buf: Buffer): string {
  return buf.toString('base64url');
}
