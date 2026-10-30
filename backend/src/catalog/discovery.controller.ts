import { Controller, Get, Headers, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { pickLanguage } from '../common/i18n/accept-language.js';
import { canonicalGenre, genreLabel, KNOWN_GENRES } from '../common/i18n/genre-label.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogService } from './catalog.service.js';
import { GenresDto, GenresQueryDto, RankingsDto, RankingsQueryDto } from './dto/catalog.dto.js';
import { RankingsService } from './rankings.service.js';

/** Classements (M-04) et genres localisés (DEF-012), contrat v1.5. */
@ApiTags('catalog')
@Controller()
export class DiscoveryController {
  constructor(
    private readonly rankings: RankingsService,
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('rankings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Classement des séries par spectateurs distincts (M-04)',
    description:
      '`period=day|week|all` : spectateurs distincts dont la progression a bougé sur la période ; séries publiées et autorisées sur le territoire (`X-Country`), filtre `genre` optionnel ; 20 séries max ; cache 10 min. Avec un jeton, `isFavorite` / `likes` sont ajoutés après le cache.',
  })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiOkResponse({ type: RankingsDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  async getRankings(
    @Query() query: RankingsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
    @ViewerCountry() country?: string,
  ): Promise<RankingsDto> {
    const viewer = await this.catalog.viewerContext(user?.id, { country });
    return this.rankings.rankings(query.period, query.genre, viewer);
  }

  @Public()
  @Get('genres')
  @ApiOperation({
    summary: 'Genres avec libellés localisés (DEF-012)',
    description:
      'Genres connus (romance, drame, comédie, action, thriller, fantastique, famille) dans la langue `lang` (sinon `Accept-Language`, repli fr), complétés par les genres présents dans les séries publiées (libellé = clé). `SeriesSummary.genres` reste la liste des clés.',
  })
  @ApiHeader({ name: 'Accept-Language', required: false, example: 'en' })
  @ApiOkResponse({ type: GenresDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR' })
  async getGenres(
    @Query() query: GenresQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<GenresDto> {
    const lang = query.lang ?? pickLanguage(acceptLanguage);
    const rows = await this.prisma.series.findMany({
      where: { status: 'PUBLISHED' },
      select: { genres: true },
    });
    const keys = [...KNOWN_GENRES];
    for (const row of rows) {
      for (const g of row.genres) {
        const k = canonicalGenre(g);
        if (k && !keys.includes(k)) keys.push(k);
      }
    }
    return { lang, items: keys.map((key) => ({ key, label: genreLabel(key, lang) })) };
  }
}
