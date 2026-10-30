import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { normalizeCountry } from '../common/i18n/accept-language.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { AnalyticsService } from './analytics.service.js';
import { PostEventsDto, PostEventsResultDto } from './dto/analytics.dto.js';

/** Plan de marquage côté serveur (§13, S06-BE-03). */
@ApiTags('analytics')
@Controller('events')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @RateLimit({ name: 'events_ip', limit: 120, windowSeconds: 60, scope: 'ip' })
  @ApiOperation({
    summary: 'Envoyer un lot d’événements d’analyse (50 max)',
    description:
      'Noms limités au plan de marquage du §13 (`app_open`, `series_view`, `episode_start`, `episode_complete`, `paywall_view`, `unlock`, `purchase`, `subscription_start`, `ad_reward`, `checkin`, `push_open`, `login`, `signup`, `share`, `search`, `push_permission_granted`) ; `params` ≤ 2 Ko. `share` et `push_permission_granted` alimentent la progression des tâches récompensées (M-41). Le jeton utilisateur est facultatif (événements avant la session invité) ; `X-Country` renseigne le pays.',
  })
  @ApiHeader({ name: 'X-Country', required: false, description: 'ISO 3166-1 alpha-2' })
  @ApiAcceptedResponse({ type: PostEventsResultDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | EVENT_PARAMS_TOO_LARGE',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED' })
  post(
    @Body() dto: PostEventsDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-country') country?: string,
  ): Promise<PostEventsResultDto> {
    return this.analytics.ingest(dto, { userId: user?.id, country: normalizeCountry(country) });
  }
}
