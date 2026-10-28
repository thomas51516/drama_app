import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';

/**
 * Connexion Redis partagée (cache catalogue, limites de débit, plafonds de pubs, BullMQ).
 * La connexion est tolérante : l'API démarre même si Redis est indisponible, /health le signale.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: AppConfig) {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5_000),
    });
    this.client.on('error', (err: Error) => this.logger.warn(`Redis error: ${err.message}`));
    this.client.on('ready', () => this.logger.log('Connected to Redis'));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.error(`Redis unreachable at startup: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  ping(): Promise<string> {
    return this.client.ping();
  }
}
