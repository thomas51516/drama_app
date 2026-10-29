import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

/** Durées de cache (contrat admin v1.1, S04-BE-04). */
export const HOME_CACHE_TTL_SECONDS = 60;
export const SERIES_CACHE_TTL_SECONDS = 120;

const PREFIX = 'cache:v1';

/**
 * Cache Redis du catalogue public (S04-BE-04). Seules les réponses non personnalisées y entrent :
 * l'accès par épisode et « Continuer à regarder » sont recalculés après lecture du cache.
 * Tolérant aux pannes : sans Redis, les lectures et écritures échouent silencieusement (journalisées)
 * et la réponse est calculée à chaque appel.
 */
@Injectable()
export class CatalogCacheService {
  private readonly logger = new Logger(CatalogCacheService.name);

  constructor(private readonly redis: RedisService) {}

  static homeKey(country: string | null | undefined, lang: string): string {
    return `${PREFIX}:home:${country ?? '*'}:${lang}`;
  }

  static seriesKey(seriesId: string, view: 'detail' | 'episodes', country?: string | null): string {
    return `${PREFIX}:series:${seriesId}:${view}:${country ?? '*'}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${(err as Error).message}`);
    }
  }

  /** Lecture ou calcul puis écriture. `fresh` force le recalcul (aperçu back-office). */
  async remember<T>(
    key: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
    fresh = false,
  ): Promise<T> {
    if (!fresh) {
      const hit = await this.get<T>(key);
      if (hit !== null) return hit;
    }
    const value = await compute();
    if (!fresh) await this.set(key, value, ttlSeconds);
    return value;
  }

  /** Toute modification de la configuration de l'accueil ou du catalogue visible. */
  invalidateHome(): Promise<number> {
    return this.deleteByPattern(`${PREFIX}:home:*`);
  }

  /** Fiche et épisodes d'une série (publication, patch, épisode READY / supprimé / réordonné, sous-titres). */
  async invalidateSeries(seriesId: string, includeHome = true): Promise<number> {
    const deleted = await this.deleteByPattern(`${PREFIX}:series:${seriesId}:*`);
    return includeHome ? deleted + (await this.invalidateHome()) : deleted;
  }

  async invalidateAll(): Promise<number> {
    return this.deleteByPattern(`${PREFIX}:*`);
  }

  private async deleteByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) deleted += await this.redis.client.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed for ${pattern}: ${(err as Error).message}`);
    }
    return deleted;
  }
}
