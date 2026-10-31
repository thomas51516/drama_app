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
import { UuidPipe } from '../../common/pipes/uuid.pipe.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminRightsService } from './admin-rights.service.js';
import {
  CreateRightsContractDto,
  RightsContractDto,
  RightsContractListDto,
  RightsContractListQueryDto,
  UpdateRightsContractDto,
} from './dto/admin-rights.dto.js';

/**
 * Droits et contrats (B-12). Lecture : tout compte interne actif (EDITOR y compris).
 * Écriture (création, modification, suppression) : MONETIZATION et ADMIN — ce sont les rôles qui
 * gèrent déjà la monétisation et les paramètres globaux dans cette organisation (contrat admin v1.6).
 */
@ApiTags('admin-rights')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminRightsController {
  constructor(private readonly rights: AdminRightsService) {}

  @Get('rights-contracts')
  @ApiOperation({
    summary:
      'Liste de rappel pour le renouvellement : toutes les séries avec leur statut de droits',
    description:
      '`expiringWithinDays` ne garde que ce qui demande une action : sans contrat (NONE), hors fenêtre (EXPIRED), ou contrat actif dont `licenseEndsAt` tombe dans les N jours.',
  })
  @ApiOkResponse({ type: RightsContractListDto })
  list(@Query() query: RightsContractListQueryDto): Promise<RightsContractListDto> {
    return this.rights.list(query);
  }

  @Get('series/:id/rights-contract')
  @ApiOperation({ summary: "Contrat de droits courant d'une série" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RightsContractDto })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'SERIES_NOT_FOUND | RIGHTS_CONTRACT_NOT_FOUND',
  })
  get(@Param('id', UuidPipe) id: string): Promise<RightsContractDto> {
    return this.rights.getForSeries(id);
  }

  @Post('series/:id/rights-contract')
  @Roles('MONETIZATION', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enregistrer le contrat de droits de la série (409 si déjà présent)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: RightsContractDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'SERIES_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'RIGHTS_CONTRACT_ALREADY_EXISTS' })
  create(
    @Param('id', UuidPipe) id: string,
    @Body() dto: CreateRightsContractDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<RightsContractDto> {
    return this.rights.create(id, dto, admin, ip);
  }

  @Patch('series/:id/rights-contract')
  @Roles('MONETIZATION', 'ADMIN')
  @ApiOperation({ summary: 'Modifier le contrat de droits de la série' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: RightsContractDto })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'SERIES_NOT_FOUND | RIGHTS_CONTRACT_NOT_FOUND',
  })
  update(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateRightsContractDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<RightsContractDto> {
    return this.rights.update(id, dto, admin, ip);
  }

  @Delete('series/:id/rights-contract')
  @Roles('MONETIZATION', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer le contrat de droits de la série' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description: 'SERIES_NOT_FOUND | RIGHTS_CONTRACT_NOT_FOUND',
  })
  remove(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.rights.remove(id, admin, ip);
  }
}
