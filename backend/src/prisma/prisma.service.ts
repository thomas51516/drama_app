import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Client Prisma partagé (Prisma 7, driver adapter `pg`).
 * Règle : aucune écriture de solde hors d'une transaction contenant la ligne de grand livre.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      // `max` : taille du pool `pg` (DATABASE_POOL_SIZE, défaut 20). Le défaut de la librairie `pg`
      // (10) s'est révélé trop bas lors du test de charge S10-OPS-01 : au-delà d'une centaine de
      // requêtes simultanées, les requêtes font la queue pour une connexion plutôt que d'attendre
      // Postgres lui-même (les requêtes elles-mêmes restent de l'ordre du millisecond).
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.databasePoolSize,
      }),
      log: config.isProduction ? ['error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
