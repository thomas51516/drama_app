import { Global, Module } from '@nestjs/common';
import { AppConfig } from './app-config.js';
import { validateEnv } from './env.schema.js';

/**
 * Module de configuration global : valide `process.env` avec zod au démarrage
 * et expose une instance `AppConfig` injectable partout.
 */
@Global()
@Module({
  providers: [
    {
      provide: AppConfig,
      useFactory: (): AppConfig => new AppConfig(validateEnv(process.env)),
    },
  ],
  exports: [AppConfig],
})
export class ConfigModule {}
