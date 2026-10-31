import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminStatsService } from './admin-stats.service.js';
import {
  RetentionQueryDto,
  RetentionStatsDto,
  StatsOverviewDto,
  StatsOverviewQueryDto,
} from './dto/admin-stats.dto.js';

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
    summary:
      'Vue d’ensemble : utilisateurs actifs, nouveaux comptes, épisodes vus, top séries, revenus par source, conversion au paywall',
    description:
      'Agrégats SQL sur `users`, `watch_progress`, `coin_ledger`/`purchases` et `analytics_events` (`days` = fenêtre pour `newUsers`, `episodesStarted`, `episodesCompleted`, `topSeries`, `unlocks`, `revenueBySource`, `paywallConversion` ; `activeUsers` toujours sur 1, 7 et 30 jours). Mis en cache 5 min par fenêtre. La rétention par épisode est un endpoint séparé (`GET /admin/stats/retention`) car elle se paramètre par série plutôt que par fenêtre de jours.',
  })
  @ApiOkResponse({ type: StatsOverviewDto })
  overview(@Query() query: StatsOverviewQueryDto): Promise<StatsOverviewDto> {
    return this.stats.overview(query.days);
  }

  @Get('retention')
  @ApiOperation({
    summary: 'Courbe de rétention par épisode (B-11)',
    description:
      "Pourcentage de la cohorte « épisode 1 » encore présente à l'épisode N, calculé depuis `watch_progress` (démarré = une ligne existe). `seriesId` restreint à une série ; absent, les cohortes de toutes les séries sont combinées (voir la description du DTO pour le détail du calcul). Pas de cache (dataset réduit, paramétrage variable).",
  })
  @ApiOkResponse({ type: RetentionStatsDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  retention(@Query() query: RetentionQueryDto): Promise<RetentionStatsDto> {
    return this.stats.retention(query.seriesId);
  }
}
