import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { CampaignSenderService } from './campaign-sender.service.js';
import { NewEpisodeNotifier } from './new-episode-notifier.service.js';
import { FcmPushProvider } from './providers/fcm-push.provider.js';
import { LogPushProvider } from './providers/log-push.provider.js';
import { PushController } from './push.controller.js';
import { PushQueue } from './push.queue.js';
import { PushService } from './push.service.js';
import { PUSH_PROVIDER, type PushProvider } from './push.types.js';

/**
 * Notifications push (M-54, S06-BE-01, B-10). Global : le déclencheur « nouvel épisode » est
 * appelé par le transcodage et la publication programmée, la réponse du support par le centre d'aide.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [
    {
      provide: PUSH_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PushProvider =>
        config.push.provider === 'fcm' ? new FcmPushProvider(config) : new LogPushProvider(),
    },
    PushService,
    NewEpisodeNotifier,
    CampaignSenderService,
    PushQueue,
  ],
  exports: [PushService, NewEpisodeNotifier, CampaignSenderService, PushQueue],
})
export class PushModule {}
