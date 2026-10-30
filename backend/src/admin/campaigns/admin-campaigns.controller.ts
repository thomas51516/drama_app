import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
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
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminCampaignsService } from './admin-campaigns.service.js';
import {
  CampaignDto,
  CampaignEstimateDto,
  CampaignListDto,
  CreateCampaignDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
} from './dto/campaign.dto.js';
import { UuidPipe } from '../../common/pipes/uuid.pipe.js';

/** Campagnes push ciblées (B-10, contrat v1.3). Rôles MONETIZATION et ADMIN. */
@ApiTags('admin-campaigns')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('MONETIZATION', 'ADMIN')
@Controller('admin/campaigns')
export class AdminCampaignsController {
  constructor(private readonly campaigns: AdminCampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les campagnes (filtre statut, antichronologique)' })
  @ApiOkResponse({ type: CampaignListDto })
  list(@Query() query: ListCampaignsQueryDto): Promise<CampaignListDto> {
    return this.campaigns.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une campagne (brouillon)',
    description:
      "Segments : `ALL`, `COUNTRY` (`countries`), `SERIES_FOLLOWERS` (`seriesId`, favoris), `INACTIVE` (`inactiveDays`). L'audience exclut les comptes sans appareil et ceux ayant désactivé les « offres ».",
  })
  @ApiCreatedResponse({ type: CampaignDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR | SEGMENT_INVALID' })
  create(
    @Body() dto: CreateCampaignDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<CampaignDto> {
    return this.campaigns.create(dto, admin, ip);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’une campagne' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_FOUND' })
  get(@Param('id', UuidPipe) id: string): Promise<CampaignDto> {
    return this.campaigns.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une campagne (brouillon ou programmée)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_EDITABLE' })
  update(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<CampaignDto> {
    return this.campaigns.update(id, dto, admin, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un brouillon' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_DRAFT' })
  remove(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.campaigns.remove(id, admin, ip);
  }

  @Post(':id/estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estimer l’audience actuelle du segment' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignEstimateDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_FOUND' })
  estimate(@Param('id', UuidPipe) id: string): Promise<CampaignEstimateDto> {
    return this.campaigns.estimate(id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Envoyer (immédiatement, ou à `scheduledAt` si la date est future)',
    description:
      'Envoi par lots de 500 via la file BullMQ `push`, préférences « offres » et plafond quotidien (2 push par jour) respectés. Statut `SENDING` puis `SENT`, ou `SCHEDULED` jusqu’à la date.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_SENDABLE' })
  send(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<CampaignDto> {
    return this.campaigns.send(id, admin, ip);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler (brouillon, programmée ou en cours : arrêt au lot suivant)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'CAMPAIGN_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'CAMPAIGN_ALREADY_SENT' })
  cancel(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<CampaignDto> {
    return this.campaigns.cancel(id, admin, ip);
  }
}
