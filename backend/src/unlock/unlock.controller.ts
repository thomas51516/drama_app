import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { UnlockService } from './unlock.service.js';

/** Hors périmètre OpenAPI v0.1 : exclu de /docs jusqu'au sprint 7. */
@ApiExcludeController()
@Controller()
export class UnlockController {
  constructor(private readonly unlock: UnlockService) {}

  // TODO S07-BE-02
  @Post('episodes/:id/unlock')
  unlockEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.unlock.unlockWithCoins(user.id, id, '');
  }

  // TODO S08-BE-03 : callback serveur de la régie (signé), pas d'auth utilisateur
  @Public()
  @Post('ads/reward')
  adReward(@Body() payload: unknown): never {
    return this.unlock.rewardFromAd(payload);
  }
}
