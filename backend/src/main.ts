import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.js';
import { setupSwagger } from './openapi/openapi.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
const config = app.get(AppConfig);
app.useLogger(config.logLevels);
configureApp(app, config);
if (config.swaggerEnabled) setupSwagger(app);

await app.listen(config.port);
Logger.log(
  `API ready on http://localhost:${config.port}${config.swaggerEnabled ? ' — docs: /docs' : ''} (${config.nodeEnv})`,
  'Bootstrap',
);
