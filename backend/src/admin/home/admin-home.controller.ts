import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { HomeResponseDto } from '../../catalog/dto/catalog.dto.js';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminHomeService } from './admin-home.service.js';
import {
  CreateHomeBannerDto,
  CreateHomeRowDto,
  HomeBannerAdminDto,
  HomePreviewQueryDto,
  HomeRowAdminDto,
  ReorderHomeItemsDto,
  UpdateHomeBannerDto,
  UpdateHomeRowDto,
} from './dto/admin-home.dto.js';

/** Mise en avant (B-05, contrat admin v1.1). Lecture : tout compte actif ; écriture : EDITOR et ADMIN. */
@ApiTags('admin-home')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin/home')
export class AdminHomeController {
  constructor(private readonly home: AdminHomeService) {}

  // ---------------------------------------------------------------- bannières

  @Get('banners')
  @ApiOperation({ summary: 'Lister les bannières (toutes, dans l’ordre d’affichage)' })
  @ApiOkResponse({ type: [HomeBannerAdminDto] })
  listBanners(): Promise<HomeBannerAdminDto[]> {
    return this.home.listBanners();
  }

  @Post('banners')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une bannière (position = dernière)' })
  @ApiCreatedResponse({ type: HomeBannerAdminDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | HOME_BANNER_WINDOW_INVALID',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  createBanner(
    @Body() dto: CreateHomeBannerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<HomeBannerAdminDto> {
    return this.home.createBanner(dto, admin, ip);
  }

  @Put('banners/order')
  @Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'Réordonner les bannières (toutes les bannières, nouvel ordre)' })
  @ApiOkResponse({ type: [HomeBannerAdminDto] })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'HOME_ORDER_MISMATCH' })
  reorderBanners(
    @Body() dto: ReorderHomeItemsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<HomeBannerAdminDto[]> {
    return this.home.reorderBanners(dto, admin, ip);
  }

  @Patch('banners/:id')
  @Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'Modifier une bannière' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HomeBannerAdminDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | HOME_BANNER_WINDOW_INVALID',
  })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'HOME_BANNER_NOT_FOUND | SERIES_NOT_FOUND',
  })
  updateBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHomeBannerDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<HomeBannerAdminDto> {
    return this.home.updateBanner(id, dto, admin, ip);
  }

  @Delete('banners/:id')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une bannière' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'HOME_BANNER_NOT_FOUND' })
  removeBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.home.removeBanner(id, admin, ip);
  }

  // ------------------------------------------------------------------ rangées

  @Get('rows')
  @ApiOperation({ summary: 'Lister les rangées (toutes, dans l’ordre d’affichage)' })
  @ApiOkResponse({ type: [HomeRowAdminDto] })
  listRows(): Promise<HomeRowAdminDto[]> {
    return this.home.listRows();
  }

  @Post('rows')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une rangée (position = dernière)',
    description:
      'Types : TRENDING (séries les plus regardées sur 7 jours), NEW (dernières publiées), GENRE (`genre` requis), MANUAL (`seriesIds` requis, ordre conservé), CONTINUE_WATCHING (progression du spectateur connecté). `titles.fr` obligatoire, en/es/pt optionnels (repli fr).',
  })
  @ApiCreatedResponse({ type: HomeRowAdminDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | HOME_ROW_GENRE_REQUIRED | HOME_ROW_SERIES_REQUIRED',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'HOME_ROW_KEY_TAKEN' })
  createRow(
    @Body() dto: CreateHomeRowDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<HomeRowAdminDto> {
    return this.home.createRow(dto, admin, ip);
  }

  @Put('rows/order')
  @Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'Réordonner les rangées (toutes les rangées, nouvel ordre)' })
  @ApiOkResponse({ type: [HomeRowAdminDto] })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'HOME_ORDER_MISMATCH' })
  reorderRows(
    @Body() dto: ReorderHomeItemsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<HomeRowAdminDto[]> {
    return this.home.reorderRows(dto, admin, ip);
  }

  @Patch('rows/:id')
  @Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'Modifier une rangée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: HomeRowAdminDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_ERROR | HOME_ROW_GENRE_REQUIRED | HOME_ROW_SERIES_REQUIRED',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'HOME_ROW_NOT_FOUND | SERIES_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'HOME_ROW_KEY_TAKEN' })
  updateRow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHomeRowDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<HomeRowAdminDto> {
    return this.home.updateRow(id, dto, admin, ip);
  }

  @Delete('rows/:id')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une rangée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'HOME_ROW_NOT_FOUND' })
  removeRow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.home.removeRow(id, admin, ip);
  }

  // ------------------------------------------------------------------- aperçu

  @Get('preview')
  @ApiOperation({
    summary: 'Aperçu de `GET /home` pour un pays et une langue (sans cache, spectateur anonyme)',
  })
  @ApiOkResponse({ type: HomeResponseDto })
  preview(@Query() query: HomePreviewQueryDto): Promise<HomeResponseDto> {
    return this.home.preview(query);
  }
}
