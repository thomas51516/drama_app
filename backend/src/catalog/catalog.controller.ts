import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { CatalogService } from './catalog.service.js';
import { HomeService } from './home.service.js';
import { SearchService } from './search.service.js';
import {
  EpisodeSummaryDto,
  FeedQueryDto,
  FeedResponseDto,
  HomeResponseDto,
  ListSeriesQueryDto,
  PaginatedSeriesDto,
  SearchQueryDto,
  SearchResponseDto,
  SearchSuggestionsDto,
  SearchSuggestQueryDto,
  SeriesDetailDto,
} from './dto/catalog.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';

/**
 * Catalogue (§8.2). Routes publiques : un jeton valide est optionnel mais permet
 * la personnalisation (statut des épisodes, « Continuer à regarder », territoires,
 * `isFavorite` / `likes` sur les résumés de séries).
 */
@ApiTags('catalog')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Country',
  required: false,
  description:
    'Pays du spectateur (ISO 3166-1 alpha-2, deux lettres, sinon 400 VALIDATION_ERROR) : filtre territorial et rangées / bannières par pays. Sinon pays du compte, sinon aucun filtre.',
  example: 'TG',
})
@ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
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
    private readonly search: SearchService,
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
    @ViewerCountry() country?: string,
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
    @ViewerCountry() country?: string,
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
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @ViewerCountry() country?: string,
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
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<EpisodeSummaryDto[]> {
    return this.catalog.listEpisodes(id, await this.catalog.viewerContext(user?.id, { country }));
  }

  @Public()
  @Get('feed')
  @ApiOperation({
    summary: 'Flux vertical « Pour vous » (M-02), pagination par curseur',
    description:
      'Premier épisode de chaque série publiée. `previewUrl` est signée comme `/play` (`previewExpiresAt`), `episode` porte le statut d’accès du spectateur et `isFavorite` son favori (S04-BE-03).',
  })
  @ApiOkResponse({ type: FeedResponseDto })
  async feed(
    @Query() query: FeedQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<FeedResponseDto> {
    return this.catalog.getFeed(query, await this.catalog.viewerContext(user?.id, { country }));
  }

  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Recherche de séries (M-03)',
    description:
      'Recherche plein texte PostgreSQL (titre, synopsis, tags, genres ; dictionnaires français et simple, accents ignorés, préfixes) sur les séries publiées et autorisées sur le territoire ; classement par pertinence. `suggestions` : titres commençant par le texte saisi (8 au plus).',
  })
  @ApiOkResponse({ type: SearchResponseDto })
  async searchSeries(
    @Query() query: SearchQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<SearchResponseDto> {
    const viewer = await this.catalog.viewerContext(user?.id, { country });
    const result = await this.search.search(query, viewer);
    return { ...result, items: await this.catalog.personalize(viewer.userId, result.items) };
  }

  @Public()
  @Get('search/suggest')
  @ApiOperation({
    summary: 'Suggestions de titres (M-03)',
    description: 'Titres de séries publiées commençant par le préfixe saisi, 8 au plus.',
  })
  @ApiOkResponse({ type: SearchSuggestionsDto })
  async suggest(
    @Query() query: SearchSuggestQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<SearchSuggestionsDto> {
    const viewer = await this.catalog.viewerContext(user?.id, { country });
    return { suggestions: await this.search.suggest(query.q, viewer) };
  }
}
