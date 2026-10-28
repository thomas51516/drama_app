import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  AdRewardAckDto,
  AdRewardCallbackDto,
  UnlockEpisodeDto,
  UnlockResultDto,
} from './dto/unlock.dto.js';
import { UnlockService } from './unlock.service.js';

/** Déblocage (§8.2, §8.4). Planifié S07-BE-02 (pièces) et S08-BE-03 (pub récompensée). */
@ApiTags('unlock')
@ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
@Controller()
export class UnlockController {
  constructor(private readonly unlock: UnlockService) {}

  // TODO S07-BE-02
  @Post('episodes/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Débloquer un épisode avec des pièces (planifié S07-BE-02)',
    description:
      'Débit (bonus avant achetées) et création du déblocage dans la même transaction ; idempotent par `idempotencyKey`. 402 `INSUFFICIENT_COINS` si le solde est insuffisant (details.coinCost, details.balance).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UnlockResultDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'USER_BLOCKED' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EPISODE_FREE | EPISODE_NOT_READY' })
  unlockEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnlockEpisodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.unlock.unlockWithCoins(user.id, id, dto.idempotencyKey);
  }

  // TODO S08-BE-03 : callback serveur de la régie (signé), pas d'auth utilisateur
  @Public()
  @Post('ads/reward')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Callback SSV de la régie publicitaire (planifié S08-BE-03)',
    description:
      'Appelé par la régie, jamais par l’app. Crédit uniquement après vérification de la signature ; plafond quotidien par utilisateur (Redis). Idempotent par `transactionId`.',
  })
  @ApiOkResponse({ type: AdRewardAckDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'INVALID_AD_SIGNATURE' })
  adReward(@Body() payload: AdRewardCallbackDto): never {
    return this.unlock.rewardFromAd(payload);
  }
}
