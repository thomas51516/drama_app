import { Controller, Get, Headers, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { notImplemented } from '../common/errors/not-implemented.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { CatalogService } from './catalog.service.js';
import { HomeService } from './home.service.js';
import {
  EpisodeSummaryDto,
  FeedQueryDto,
  FeedResponseDto,
  HomeResponseDto,
  ListSeriesQueryDto,
  PaginatedSeriesDto,
  SearchQueryDto,
  SeriesDetailDto,
} from './dto/catalog.dto.js';

/**
 * Catalogue (§8.2). Routes publiques : un jeton valide est optionnel mais permet
 * la personnalisation (statut des épisodes, « Continuer à regarder », territoires).
 * `GET /search` : planifié S05-BE-06 (501 en attendant).
 */
@ApiTags('catalog')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Country',
  required: false,
  description:
    'Pays du spectateur (ISO 3166-1 alpha-2) : filtre territorial et rangées / bannières par pays. Sinon pays du compte, sinon aucun filtre.',
  example: 'TG',
})
@ApiHeader({
  name: 'Accept-Language',
  required: false,
  description: 'Langue des titres de rangées : fr (défaut), en, es, pt.',
  example: 'fr-FR,fr;q=0.9,en;q=0.8',
})
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly home: HomeService,
  ) {}

  @Public()
  @Get('home')
  @ApiOperation({
    summary: "Écran d'accueil : bannières et rangées (M-01)",
    description:
      'Construit à partir de la configuration du back-office (B-05) : bannières actives puis rangées actives (TRENDING = séries les plus regardées sur 7 jours, NEW = dernières publiées, GENRE, MANUAL, CONTINUE_WATCHING uniquement avec un jeton). Filtré par `X-Country`, titré selon `Accept-Language`. Mis en cache 60 s par pays et langue (hors « Continuer à regarder »).',
  })
  @ApiOkResponse({ type: HomeResponseDto })
  async getHome(
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-country') country?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<HomeResponseDto> {
    const viewer = await this.catalog.viewerContext(user?.id, { country, acceptLanguage });
    return this.home.getHome(viewer);
  }

  @Public()
  @Get('series')
  @ApiOperation({ summary: 'Lister les séries publiées (paginé, filtre par genre)' })
  @ApiOkResponse({ type: PaginatedSeriesDto })
  async list(
    @Query() query: ListSeriesQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-country') country?: string,
  ): Promise<PaginatedSeriesDto> {
    return this.catalog.listSeries(query, await this.catalog.viewerContext(user?.id, { country }));
  }

  @Public()
  @Get('series/:id')
  @ApiOperation({ summary: 'Fiche série (M-10) — mise en cache 120 s' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SeriesDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-country') country?: string,
  ): Promise<SeriesDetailDto> {
    return this.catalog.getSeries(id, await this.catalog.viewerContext(user?.id, { country }));
  }

  @Public()
  @Get('series/:id/episodes')
  @ApiOperation({
    summary:
      'Grille des épisodes avec statut gratuit / débloqué / verrouillé et sous-titres (M-10)',
    description:
      'La liste anonyme est mise en cache 120 s ; le statut d’accès est recalculé pour le spectateur authentifié. `subtitles` expose les pistes WebVTT (B-03).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [EpisodeSummaryDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  async episodes(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-country') country?: string,
  ): Promise<EpisodeSummaryDto[]> {
    return this.catalog.listEpisodes(id, await this.catalog.viewerContext(user?.id, { country }));
  }

  @Public()
  @Get('feed')
  @ApiOperation({ summary: 'Flux vertical « Pour vous » (M-02), pagination par curseur' })
  @ApiOkResponse({ type: FeedResponseDto })
  async feed(
    @Query() query: FeedQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
    @Headers('x-country') country?: string,
  ): Promise<FeedResponseDto> {
    return this.catalog.getFeed(query, await this.catalog.viewerContext(user?.id, { country }));
  }

  // TODO S05-BE-06 : recherche plein texte PostgreSQL (titre, synopsis, tags)
  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Recherche de séries (planifié S05-BE-06)',
    description:
      "Recherche plein texte sur les séries publiées. Répond 501 `NOT_IMPLEMENTED` jusqu'au sprint 5.",
  })
  @ApiOkResponse({ type: PaginatedSeriesDto })
  @ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
  search(@Query() _query: SearchQueryDto): never {
    return notImplemented('S05-BE-06');
  }
}
