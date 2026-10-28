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
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminEpisodesService } from './admin-episodes.service.js';
import {
  AdminEpisodeDto,
  CreateAdminEpisodeDto,
  EpisodeUploadUrlDto,
  PresignedUploadDto,
  PresignUploadDto,
  ReorderEpisodesDto,
  UpdateAdminEpisodeDto,
  UploadTargetDto,
} from './dto/admin-episode.dto.js';

/** Épisodes et upload (B-02, contrat admin v1). Écriture : EDITOR et ADMIN. */
@ApiTags('admin-episodes')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminEpisodesController {
  constructor(private readonly episodes: AdminEpisodesService) {}

  @Get('series/:id/episodes')
  @ApiOperation({
    summary:
      "Épisodes d'une série, triés par numéro (à interroger toutes les 5 s pendant un transcodage)",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [AdminEpisodeDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  list(@Param('id', ParseUUIDPipe) seriesId: string): Promise<AdminEpisodeDto[]> {
    return this.episodes.list(seriesId);
  }

  @Post('series/:id/episodes')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un épisode (numéro auto = max + 1)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: AdminEpisodeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'EPISODE_NUMBER_TAKEN' })
  create(
    @Param('id', ParseUUIDPipe) seriesId: string,
    @Body() dto: CreateAdminEpisodeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminEpisodeDto> {
    return this.episodes.create(seriesId, dto, admin, ip);
  }

  @Put('series/:id/episodes/order')
  @Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'Réordonner les épisodes (renumérotés 1..n dans l’ordre donné)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [AdminEpisodeDto] })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'EPISODE_ORDER_MISMATCH' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  reorder(
    @Param('id', ParseUUIDPipe) seriesId: string,
    @Body() dto: ReorderEpisodesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminEpisodeDto[]> {
    return this.episodes.reorder(seriesId, dto, admin, ip);
  }

  @Patch('episodes/:id')
  @Roles('EDITOR', 'ADMIN')
  @ApiOperation({ summary: 'Modifier le titre ou la date de publication' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminEpisodeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminEpisodeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminEpisodeDto> {
    return this.episodes.update(id, dto, admin, ip);
  }

  @Delete('episodes/:id')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un épisode (et ses fichiers HLS / source)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.episodes.remove(id, admin, ip);
  }

  @Post('episodes/:id/upload-url')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'URL pré-signée PUT pour le fichier maître',
    description:
      'Le navigateur envoie le fichier directement au stockage objet (PUT sur `uploadUrl` avec `headers`), jamais via l’API. Max 2 Go, `video/mp4` ou `video/quicktime`. Appeler ensuite `/uploaded`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UploadTargetDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  uploadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EpisodeUploadUrlDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<UploadTargetDto> {
    return this.episodes.createUploadUrl(id, dto, admin, ip);
  }

  @Post('episodes/:id/uploaded')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Signaler la fin de l’upload : statut UPLOADED, transcodage mis en file',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminEpisodeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'SOURCE_MISSING | SOURCE_NOT_UPLOADED' })
  uploaded(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminEpisodeDto> {
    return this.episodes.markUploaded(id, admin, ip);
  }

  @Post('episodes/:id/retranscode')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Relancer le transcodage à partir du fichier maître existant' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminEpisodeDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'SOURCE_MISSING | SOURCE_NOT_UPLOADED' })
  retranscode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminEpisodeDto> {
    return this.episodes.retranscode(id, admin, ip);
  }

  @Post('uploads/presign')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'URL pré-signée PUT pour une affiche (`kind: poster`)' })
  @ApiOkResponse({ type: PresignedUploadDto })
  presign(
    @Body() dto: PresignUploadDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<PresignedUploadDto> {
    return this.episodes.presignPoster(dto, admin, ip);
  }
}
