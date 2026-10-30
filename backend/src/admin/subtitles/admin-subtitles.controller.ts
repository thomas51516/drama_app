import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminSubtitlesService, type UploadedSubtitleFile } from './admin-subtitles.service.js';
import {
  AdminSubtitleDto,
  MAX_SUBTITLE_BYTES,
  UploadSubtitleDto,
} from './dto/admin-subtitle.dto.js';
import { UuidPipe } from '../../common/pipes/uuid.pipe.js';

/** Sous-titres (B-03, contrat admin v1.1). Écriture : EDITOR et ADMIN. */
@ApiTags('admin-subtitles')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminSubtitlesController {
  constructor(private readonly subtitles: AdminSubtitlesService) {}

  @Get('episodes/:id/subtitles')
  @ApiOperation({ summary: "Pistes de sous-titres d'un épisode" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [AdminSubtitleDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  list(@Param('id', UuidPipe) episodeId: string): Promise<AdminSubtitleDto[]> {
    return this.subtitles.list(episodeId);
  }

  @Post('episodes/:id/subtitles')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SUBTITLE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'language'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Fichier .srt ou .vtt (2 Mo max)' },
        language: { type: 'string', example: 'fr', description: 'Code ISO 639-1' },
      },
    },
  })
  @ApiOperation({
    summary: 'Importer un fichier SRT ou VTT pour une langue (remplace la piste existante)',
    description:
      'Le SRT est converti en WebVTT côté serveur (BOM, CRLF, numéros de cue, virgules des horodatages), stocké sous `subtitles/{episodeId}/{language}.vtt` et servi publiquement avec CORS ouvert en lecture.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: AdminSubtitleDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'VALIDATION_ERROR | SUBTITLE_FILE_REQUIRED | SUBTITLE_INVALID_FORMAT | SUBTITLE_PARSE_ERROR (details.line)',
  })
  @ApiPayloadTooLargeResponse({ type: ApiErrorDto, description: 'PAYLOAD_TOO_LARGE (> 2 Mo)' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'EPISODE_NOT_FOUND' })
  upload(
    @Param('id', UuidPipe) episodeId: string,
    @UploadedFile() file: UploadedSubtitleFile | undefined,
    @Body() dto: UploadSubtitleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminSubtitleDto> {
    return this.subtitles.upload(episodeId, file, dto, admin, ip);
  }

  @Delete('subtitles/:id')
  @Roles('EDITOR', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une piste de sous-titres (et son fichier)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SUBTITLE_NOT_FOUND' })
  remove(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.subtitles.remove(id, admin, ip);
  }
}
