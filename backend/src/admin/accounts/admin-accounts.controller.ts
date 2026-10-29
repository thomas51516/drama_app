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
import { AdminAccountsService } from './admin-accounts.service.js';
import {
  AdminAccountDto,
  AuditLogListDto,
  CreateAdminAccountDto,
  ListAuditLogsQueryDto,
  ResetAdminPasswordDto,
  UpdateAdminAccountDto,
} from './dto/admin-account.dto.js';

/** Comptes internes et journal d'audit (B-13, contrat admin v1.1). Rôle ADMIN uniquement. */
@ApiTags('admin-accounts')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE | ADMIN_SELF_LOCKOUT' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'Lister les comptes internes' })
  @ApiOkResponse({ type: [AdminAccountDto] })
  list(): Promise<AdminAccountDto[]> {
    return this.accounts.list();
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un compte interne',
    description:
      'Mot de passe de 10 caractères minimum (Argon2id). La 2FA est configurée par la personne à sa première connexion.',
  })
  @ApiCreatedResponse({ type: AdminAccountDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'ADMIN_EMAIL_TAKEN' })
  create(
    @Body() dto: CreateAdminAccountDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminAccountDto> {
    return this.accounts.create(dto, admin, ip);
  }

  @Patch('accounts/:id')
  @ApiOperation({
    summary: 'Modifier nom, rôle ou activation',
    description:
      'Un admin ne peut ni se désactiver ni se retirer le rôle ADMIN (403 `ADMIN_SELF_LOCKOUT`) ; le dernier ADMIN actif ne peut être ni désactivé ni rétrogradé (409 `LAST_ADMIN`).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminAccountDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'ADMIN_ACCOUNT_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'LAST_ADMIN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminAccountDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminAccountDto> {
    return this.accounts.update(id, dto, admin, ip);
  }

  @Post('accounts/:id/reset-totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Réinitialiser la 2FA (nouvelle configuration à la prochaine connexion)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminAccountDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'ADMIN_ACCOUNT_NOT_FOUND' })
  resetTotp(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<AdminAccountDto> {
    return this.accounts.resetTotp(id, admin, ip);
  }

  @Post('accounts/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Définir un nouveau mot de passe (10 caractères minimum)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'ADMIN_ACCOUNT_NOT_FOUND' })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetAdminPasswordDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.accounts.resetPassword(id, dto, admin, ip);
  }

  @Get('audit-logs')
  @ApiOperation({
    summary: "Journal d'audit (paginé, filtres auteur / action / cible / période)",
    description:
      '`action` accepte une valeur exacte (`series.update`) ou un préfixe terminé par un point (`series.`). Tri antichronologique.',
  })
  @ApiOkResponse({ type: AuditLogListDto })
  auditLogs(@Query() query: ListAuditLogsQueryDto): Promise<AuditLogListDto> {
    return this.accounts.listAuditLogs(query);
  }
}
