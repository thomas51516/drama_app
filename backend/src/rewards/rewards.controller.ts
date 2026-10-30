import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { pickLanguage } from '../common/i18n/accept-language.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  CheckinClaimResultDto,
  CheckinStatusDto,
  ClaimDto,
  ClaimTaskResultDto,
  RewardTasksDto,
} from './dto/rewards.dto.js';
import { RewardsService } from './rewards.service.js';

/** Récompenses (§4.5, contrat v1.5) : check-in quotidien (M-40) et tâches (M-41). */
@ApiTags('rewards')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('checkin')
  @ApiOperation({
    summary: 'État du check-in quotidien (M-40)',
    description:
      'Barème sur 7 jours (`scale`), jour atteint par la série en cours (`streakDay`, 0 = aucune), `claimedToday` et `nextClaimAt`. Le jour civil est celui du fuseau du pays du compte (Africa/Lome par défaut pour les pays servis, sinon UTC). `resetOnMiss` : un jour manqué remet le cycle au jour 1.',
  })
  @ApiOkResponse({ type: CheckinStatusDto })
  getCheckin(@CurrentUser() user: AuthenticatedUser): Promise<CheckinStatusDto> {
    return this.rewards.getCheckin(user.id);
  }

  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Faire le check-in du jour (M-40)',
    description:
      'Crédite les pièces bonus du jour du cycle (ligne BONUS expirable, validité `bonusValidityDays`). Idempotent par (compte, jour) : un rejeu avec la même `idempotencyKey` renvoie le même résultat ; un second appel avec une autre clé → `409 CHECKIN_ALREADY_CLAIMED { details.nextClaimAt }`.',
  })
  @ApiOkResponse({ type: CheckinClaimResultDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'CHECKIN_ALREADY_CLAIMED' })
  checkIn(
    @Body() dto: ClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CheckinClaimResultDto> {
    return this.rewards.claimCheckin(user.id, dto.idempotencyKey);
  }

  @Get('tasks')
  @ApiOperation({
    summary: 'Tâches récompensées et progression (M-41)',
    description:
      'Clés fixes : `watch_3_episodes` (jour), `watch_10_episodes` (semaine), `enable_notifications`, `share_series`, `complete_profile`, `add_favorite`. Progression calculée côté serveur (`watch_progress`, appareils push, événements `share` / `push_permission_granted`, favoris, profil). Libellés dans la langue de `Accept-Language`.',
  })
  @ApiHeader({ name: 'Accept-Language', required: false, example: 'fr' })
  @ApiOkResponse({ type: RewardTasksDto })
  tasks(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<RewardTasksDto> {
    return this.rewards.listTasks(user.id, pickLanguage(acceptLanguage));
  }

  @Post('tasks/:id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réclamer la récompense d’une tâche (M-41)',
    description:
      'Tâche `CLAIMABLE` uniquement ; crédit BONUS idempotent par (compte, tâche, période). `409 TASK_NOT_CLAIMABLE { details.reason: in_progress | already_claimed }`.',
  })
  @ApiParam({ name: 'id', example: 'watch_3_episodes' })
  @ApiOkResponse({ type: ClaimTaskResultDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'TASK_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'TASK_NOT_CLAIMABLE' })
  claim(
    @Param('id') id: string,
    @Body() dto: ClaimDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ClaimTaskResultDto> {
    return this.rewards.claimTask(user.id, id, dto.idempotencyKey);
  }
}
