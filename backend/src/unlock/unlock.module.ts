import { Module } from '@nestjs/common';
import { UnlockController } from './unlock.controller.js';
import { UnlockService } from './unlock.service.js';

@Module({ controllers: [UnlockController], providers: [UnlockService], exports: [UnlockService] })
export class UnlockModule {}
