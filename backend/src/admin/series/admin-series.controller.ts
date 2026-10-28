import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminSeriesService } from './admin-series.service.js';
import {
  AdminSeriesDto,
  AdminSeriesListDto,
  CreateAdminSeriesDto,
  ListAdminSeriesQueryDto,
  UpdateAdminSeriesDto,
} from './dto/admin-series.dto.js';

/**
 * Séries (B-01, contrat admin v1). Lecture : tout compte interne actif.
 * Écriture : EDITOR et ADMIN ; `freeEpisodeCount` / `coinCostPerEpisode` : MONETIZATION et ADMIN.
 */
@ApiTags('admin-series')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE | FORBIDDEN_FIELDS' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin/series')
export class AdminSeriesController {
  constructor(private readonly series: AdminSeriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les séries (tous statuts, paginé, recherche)' })
  @ApiOkResponse({ type: AdminSeriesListDto })
  list(@Query() query: ListAdminSeriesQueryDto): Promise<AdminSeriesListDto> {
    return this.series.list(query);
  }

  @Post()
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une série (brouillon, slug dérivé du titre)' })
  @ApiCreatedResponse({ type: AdminSeriesDto })
  create(
    @Body() dto: CreateAdminSeriesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminSeriesDto> {
    return this.series.create(dto, admin, ip);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une série" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminSeriesDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminSeriesDto> {
    return this.series.get(id);
  }

  @Patch(':id')
  @Roles('EDITOR', 'MONETIZATION', 'ADMIN')
  @ApiOperation({
    summary: 'Modifier une série',
    description:
      'EDITOR : tous les champs sauf la monétisation ; MONETIZATION : `freeEpisodeCount` et `coinCostPerEpisode` uniquement ; ADMIN : tout. Chaque changement est tracé (ancienne / nouvelle valeur).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminSeriesDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminSeriesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminSeriesDto> {
    return this.series.update(id, dto, admin, ip);
  }

  @Post(':id/publish')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publier (409 si aucun épisode READY)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminSeriesDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'SERIES_NO_READY_EPISODE' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminSeriesDto> {
    return this.series.publish(id, admin, ip);
  }

  @Post(':id/archive')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archiver (retire la série du catalogue public)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminSeriesDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminSeriesDto> {
    return this.series.archive(id, admin, ip);
  }
}
