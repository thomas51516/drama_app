import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, posix, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../config/app-config.js';

export interface PresignedUpload {
  url: string;
  expiresAt: string;
}

export interface ObjectHead {
  sizeBytes: number;
  contentType: string | null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.vtt': 'text/vtt',
  '.json': 'application/json',
};

/**
 * Stockage objet compatible S3 (MinIO en dev, R2/Wasabi/S3 ensuite — §8.1).
 * Les fichiers maîtres sont envoyés par le navigateur directement sur une URL pré-signée (S02-BE-04) ;
 * l'API ne relaie jamais les octets.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly bucket: string;
  readonly client: S3Client;

  constructor(private readonly config: AppConfig) {
    const s3 = config.s3;
    this.bucket = s3.bucket;
    this.client = new S3Client({
      endpoint: s3.endpoint,
      region: s3.region,
      forcePathStyle: s3.forcePathStyle,
      credentials: { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey },
    });
  }

  /** URL publique (CDN) d'une clé relative. */
  publicUrl(key: string): string {
    return `${this.config.cdnBaseUrl}/${key.replace(/^\/+/, '')}`;
  }

  async presignPut(key: string, contentType: string, ttlSeconds: number): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: ttlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  }

  async presignGet(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  /** Métadonnées d'un objet, `null` s'il n'existe pas. */
  async head(key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async downloadToFile(key: string, filePath: string): Promise<void> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty body for ${key}`);
    await pipeline(res.Body as Readable, createWriteStream(filePath));
  }

  async uploadFile(key: string, filePath: string, contentType?: string): Promise<void> {
    const info = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: info.size,
        ContentType: contentType ?? contentTypeFor(filePath),
      }),
    );
  }

  /** Dépose un petit objet en mémoire (sous-titres WebVTT) ; lecture publique via `publicUrl()`. */
  async putObject(key: string, body: Buffer | string, contentType: string): Promise<void> {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentLength: data.byteLength,
        ContentType: contentType,
        CacheControl: 'public, max-age=300',
      }),
    );
  }

  /** Supprime un objet (absent = succès). */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Dépose récursivement un dossier local sous `prefix/` ; renvoie le nombre d'objets envoyés. */
  async uploadDirectory(prefix: string, dir: string, concurrency = 4): Promise<number> {
    const files = await listFiles(dir);
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
      while (index < files.length) {
        const file = files[index++];
        const key = posix.join(prefix, relative(dir, file).split('\\').join('/'));
        await this.uploadFile(key, file);
      }
    });
    await Promise.all(workers);
    return files.length;
  }

  /** Supprime tous les objets sous un préfixe (nettoyage d'un épisode). Best effort, journalisé. */
  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (deleted > 0) this.logger.log(`Deleted ${deleted} object(s) under ${prefix}`);
    return deleted;
  }
}

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? listFiles(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]),
    ),
  );
  return nested.flat();
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}
