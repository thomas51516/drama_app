import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { CatalogService } from './catalog.service.js';
import {
  EpisodeSummaryDto,
  FeedQueryDto,
  FeedResponseDto,
  HomeResponseDto,
  ListSeriesQueryDto,
  PaginatedSeriesDto,
  SeriesDetailDto,
} from './dto/catalog.dto.js';

/**
 * Catalogue (§8.2). Routes publiques : un jeton valide est optionnel mais permet
 * la personnalisation (statut des épisodes, « Continuer à regarder », territoires).
 * TODO S05-BE-06 : GET /search.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('home')
  @ApiOperation({ summary: "Écran d'accueil : bannières et rangées (M-01)" })
  @ApiOkResponse({ type: HomeResponseDto })
  async home(@CurrentUser() user?: AuthenticatedUser): Promise<HomeResponseDto> {
    return this.catalog.getHome(await this.catalog.viewerContext(user?.id));
  }

  @Public()
  @Get('series')
  @ApiOperation({ summary: 'Lister les séries publiées (paginé, filtre par genre)' })
  @ApiOkResponse({ type: PaginatedSeriesDto })
  async list(
    @Query() query: ListSeriesQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PaginatedSeriesDto> {
    return this.catalog.listSeries(query, await this.catalog.viewerContext(user?.id));
  }

  @Public()
  @Get('series/:id')
  @ApiOperation({ summary: 'Fiche série (M-10)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SeriesDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<SeriesDetailDto> {
    return this.catalog.getSeries(id, await this.catalog.viewerContext(user?.id));
  }

  @Public()
  @Get('series/:id/episodes')
  @ApiOperation({
    summary: 'Grille des épisodes avec statut gratuit / débloqué / verrouillé (M-10)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [EpisodeSummaryDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  async episodes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<EpisodeSummaryDto[]> {
    return this.catalog.listEpisodes(id, await this.catalog.viewerContext(user?.id));
  }

  @Public()
  @Get('feed')
  @ApiOperation({ summary: 'Flux vertical « Pour vous » (M-02), pagination par curseur' })
  @ApiOkResponse({ type: FeedResponseDto })
  async feed(
    @Query() query: FeedQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<FeedResponseDto> {
    return this.catalog.getFeed(query, await this.catalog.viewerContext(user?.id));
  }
}
