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
import {
  CreateLimitedOfferDto,
  CreatePromoCodeDto,
  LimitedOfferAdminDto,
  PromoCodeAdminDto,
  PromoRedemptionsDto,
  UpdateLimitedOfferDto,
  UpdatePromoCodeDto,
  WelcomeOfferSettingsDto,
} from './dto/offers.dto.js';
import { OffersService } from './offers.service.js';

/** Offres et codes promo en back-office (B-07, contrat v1.5). Rôles MONETIZATION et ADMIN. */
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
export class AdminOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('offers/welcome')
  @ApiOperation({ summary: 'Offre de bienvenue (bonus % sur le premier achat)' })
  @ApiOkResponse({ type: WelcomeOfferSettingsDto })
  getWelcome(): Promise<WelcomeOfferSettingsDto> {
    return this.offers.welcomeRules();
  }

  @Put('offers/welcome')
  @ApiOperation({ summary: 'Modifier l’offre de bienvenue ; audit `welcome_offer.update`' })
  @ApiOkResponse({ type: WelcomeOfferSettingsDto })
  putWelcome(
    @Body() dto: WelcomeOfferSettingsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<WelcomeOfferSettingsDto> {
    return this.offers.updateWelcome(dto, admin, ip);
  }

  @Get('offers/limited')
  @ApiOperation({ summary: 'Offres limitées dans le temps (toutes)' })
  @ApiOkResponse({ type: [LimitedOfferAdminDto] })
  listLimited(): Promise<LimitedOfferAdminDto[]> {
    return this.offers.listLimited();
  }

  @Post('offers/limited')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une offre limitée (bonus % sur un pack pendant une fenêtre)' })
  @ApiCreatedResponse({ type: LimitedOfferAdminDto })
  createLimited(
    @Body() dto: CreateLimitedOfferDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<LimitedOfferAdminDto> {
    return this.offers.createLimited(dto, admin, ip);
  }

  @Patch('offers/limited/:id')
  @ApiOperation({ summary: 'Modifier une offre limitée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: LimitedOfferAdminDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'OFFER_NOT_FOUND' })
  updateLimited(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateLimitedOfferDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<LimitedOfferAdminDto> {
    return this.offers.updateLimited(id, dto, admin, ip);
  }

  @Delete('offers/limited/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une offre limitée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'OFFER_NOT_FOUND' })
  deleteLimited(
    @Param('id', UuidPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.offers.deleteLimited(id, admin, ip);
  }

  @Get('promo-codes')
  @ApiOperation({ summary: 'Codes promo (tous, avec compteurs d’utilisation)' })
  @ApiOkResponse({ type: [PromoCodeAdminDto] })
  listPromoCodes(): Promise<PromoCodeAdminDto[]> {
    return this.offers.listPromoCodes();
  }

  @Post('promo-codes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer un code promo (mis en majuscules, unique)' })
  @ApiCreatedResponse({ type: PromoCodeAdminDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'PROMO_CODE_TAKEN' })
  createPromoCode(
    @Body() dto: CreatePromoCodeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<PromoCodeAdminDto> {
    return this.offers.createPromoCode(dto, admin, ip);
  }

  @Patch('promo-codes/:id')
  @ApiOperation({ summary: 'Modifier un code promo (pièces, limites, fenêtre, activation)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PromoCodeAdminDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PROMO_NOT_FOUND' })
  updatePromoCode(
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdatePromoCodeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<PromoCodeAdminDto> {
    return this.offers.updatePromoCode(id, dto, admin, ip);
  }

  @Get('promo-codes/:id/redemptions')
  @ApiOperation({ summary: 'Utilisations d’un code promo' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PromoRedemptionsDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'PROMO_NOT_FOUND' })
  redemptions(@Param('id', UuidPipe) id: string): Promise<PromoRedemptionsDto> {
    return this.offers.listRedemptions(id);
  }
}
