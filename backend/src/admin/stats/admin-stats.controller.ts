import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminStatsService } from './admin-stats.service.js';
import { StatsOverviewDto, StatsOverviewQueryDto } from './dto/admin-stats.dto.js';

/** Tableau de bord v0 (B-11). Lecture : tout compte interne actif. */
@ApiTags('admin-stats')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Vue d’ensemble : utilisateurs actifs, nouveaux comptes, épisodes vus, top séries',
    description:
      'Agrégats SQL sur `users` et `watch_progress` (`days` = fenêtre pour `newUsers`, `episodesStarted`, `episodesCompleted`, `topSeries` ; `activeUsers` toujours sur 1, 7 et 30 jours). Mis en cache 5 min par fenêtre.',
  })
  @ApiOkResponse({ type: StatsOverviewDto })
  overview(@Query() query: StatsOverviewQueryDto): Promise<StatsOverviewDto> {
    return this.stats.overview(query.days);
  }
}
