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
  Put,
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
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard.js';
import { AdminRoute } from '../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../common/decorators/current-admin.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { AdminMonetizationService } from './admin-monetization.service.js';
import {
  CheckinScaleDto,
  CoinPackAdminDto,
  CreateCoinPackDto,
  CreateVipPlanDto,
  MonetizationSettingsDto,
  ReorderDto,
  UpdateCoinPackDto,
  UpdateVipPlanDto,
  VipPlanAdminDto,
} from './dto/monetization.dto.js';
import { MonetizationSettingsService, toSettingsDto } from './monetization-settings.service.js';

/** Monétisation (B-06) et barème des récompenses (B-08), contrat v1.4. Rôles MONETIZATION et ADMIN. */
@ApiTags('admin-monetization')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('MONETIZATION', 'ADMIN')
@Controller('admin')
export class AdminMonetizationController {
  constructor(
    private readonly settings: MonetizationSettingsService,
    private readonly monetization: AdminMonetizationService,
  ) {}

  @Get('monetization/settings')
  @ApiOperation({
    summary: 'Paramètres de monétisation (défauts des séries, bonus, pub, déblocage auto)',
  })
  @ApiOkResponse({ type: MonetizationSettingsDto })
  async getSettings(): Promise<MonetizationSettingsDto> {
    return toSettingsDto(await this.settings.get());
  }

  @Put('monetization/settings')
  @ApiOperation({
    summary: 'Modifier les paramètres de monétisation',
    description:
      'Les séries existantes gardent leurs valeurs `freeEpisodeCount` / `coinCostPerEpisode` ; les défauts s’appliquent aux séries créées ensuite. `autoUnlockDefault` s’applique aux nouveaux comptes, `bonusValidityDays` aux prochains crédits bonus.',
  })
  @ApiOkResponse({ type: MonetizationSettingsDto })
  async putSettings(
    @Body() dto: MonetizationSettingsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<MonetizationSettingsDto> {
    return toSettingsDto(await this.settings.update(dto, admin, ip));
  }

  // ------------------------------------------------------------------ packs

  @Get('monetization/packs')
  @ApiOperation({ summary: 'Packs de pièces (tous, actifs ou non)' })
  @ApiOkResponse({ type: [CoinPackAdminDto] })
  listPacks(): Promise<CoinPackAdminDto[]> {
    return this.monetization.listPacks();
  }

  @Post('monetization/packs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un pack (sku = identifiant produit Play Console, immuable)' })
  @ApiCreatedResponse({ type: CoinPackAdminDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'SKU_TAKEN' })
  createPack(
    @Body() dto: CreateCoinPackDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.createPack(dto, admin, ip);
  }

  @Put('monetization/packs/order')
  @ApiOperation({ summary: 'Réordonner les packs' })
  @ApiOkResponse({ type: [CoinPackAdminDto] })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PACK_NOT_FOUND' })
  reorderPacks(
    @Body() dto: ReorderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.reorderPacks(dto.ids, admin, ip);
  }

  @Patch('monetization/packs/:id')
  @ApiOperation({ summary: 'Modifier un pack (pièces, bonus, prix, badge, activation)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CoinPackAdminDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PACK_NOT_FOUND' })
  updatePack(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateCoinPackDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.updatePack(id, dto, admin, ip);
  }

  @Delete('monetization/packs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un pack (les achats passés gardent leur sku)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PACK_NOT_FOUND' })
  deletePack(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.deletePack(id, admin, ip);
  }

  // ------------------------------------------------------------------ VIP plans

  @Get('monetization/vip-plans')
  @ApiOperation({ summary: 'Formules VIP (toutes, actives ou non)' })
  @ApiOkResponse({ type: [VipPlanAdminDto] })
  listPlans(): Promise<VipPlanAdminDto[]> {
    return this.monetization.listPlans();
  }

  @Post('monetization/vip-plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une formule VIP (sku = identifiant abonnement Play Console)' })
  @ApiCreatedResponse({ type: VipPlanAdminDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'SKU_TAKEN' })
  createPlan(
    @Body() dto: CreateVipPlanDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.createPlan(dto, admin, ip);
  }

  @Patch('monetization/vip-plans/:id')
  @ApiOperation({ summary: 'Modifier une formule VIP' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: VipPlanAdminDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PLAN_NOT_FOUND' })
  updatePlan(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateVipPlanDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.updatePlan(id, dto, admin, ip);
  }

  @Delete('monetization/vip-plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une formule VIP' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PLAN_NOT_FOUND' })
  deletePlan(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.monetization.deletePlan(id, admin, ip);
  }

  // ------------------------------------------------------------------ rewards (B-08)

  @Get('rewards/checkin')
  @ApiOperation({
    summary: 'Barème du check-in quotidien sur 7 jours (M-40, consommé au sprint 8)',
  })
  @ApiOkResponse({ type: CheckinScaleDto })
  getCheckin(): Promise<CheckinScaleDto> {
    return this.settings.getCheckin();
  }

  @Put('rewards/checkin')
  @ApiOperation({
    summary: 'Modifier le barème du check-in (7 montants, remise à zéro si jour manqué)',
  })
  @ApiOkResponse({ type: CheckinScaleDto })
  putCheckin(
    @Body() dto: CheckinScaleDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ) {
    return this.settings.updateCheckin(dto, admin, ip);
  }
}
