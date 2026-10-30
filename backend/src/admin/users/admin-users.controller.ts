import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserDto } from '../../auth/dto/user.dto.js';
import { AdminRoute } from '../../common/decorators/admin-route.decorator.js';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../../common/dto/api-error.dto.js';
import { UuidPipe } from '../../common/pipes/uuid.pipe.js';
import { type AuthenticatedAdmin } from '../../common/request-context.js';
import { WalletDto } from '../../wallet/dto/wallet.dto.js';
import { AdminAuthGuard } from '../auth/admin-auth.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import {
  AdjustCoinsDto,
  AdminUserDetailDto,
  AdminUserListDto,
  BlockUserDto,
  ListAdminUsersQueryDto,
} from './dto/admin-user.dto.js';

/** Utilisateurs et support (B-09, contrat v1.4). Rôles SUPPORT et ADMIN ; toute mutation est auditée. */
@ApiTags('admin-users')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('SUPPORT', 'ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Rechercher des utilisateurs (identifiant, e-mail, téléphone, nom)',
    description:
      '`q` : identifiant exact (UUID) ou texte contenu dans l’e-mail, le téléphone ou le nom affiché. Tri par dernière activité.',
  })
  @ApiOkResponse({ type: AdminUserListDto })
  list(@Query() query: ListAdminUsersQueryDto): Promise<AdminUserListDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Fiche utilisateur : profil, portefeuille, abonnement, déblocages, achats, grand livre',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'USER_NOT_FOUND' })
  detail(@Param('id', UuidPipe) id: string): Promise<AdminUserDetailDto> {
    return this.users.detail(id);
  }

  @Post(':id/coins')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Créditer ou débiter des pièces (ligne ADJUSTMENT, motif obligatoire)',
    description:
      'Ligne `ADJUSTMENT` du grand livre ; audit `wallet.adjust` avec les soldes avant / après et le motif. Un débit peut rendre le solde négatif (bloque les déblocages).',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: WalletDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'USER_NOT_FOUND' })
  adjust(
    @Param('id', UuidPipe) id: string,
    @Body() dto: AdjustCoinsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<WalletDto> {
    return this.users.adjustCoins(id, dto, admin, ip);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquer un compte (statut BLOCKED, jetons révoqués)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'USER_NOT_ACTIVE' })
  block(
    @Param('id', UuidPipe) id: string,
    @Body() dto: BlockUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<UserDto> {
    return this.users.block(id, dto.reason, admin, ip);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Débloquer un compte (statut ACTIVE)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'USER_NOT_FOUND' })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'USER_NOT_BLOCKED' })
  unblock(
    @Param('id', UuidPipe) id: string,
    @Body() dto: BlockUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<UserDto> {
    return this.users.unblock(id, dto.reason, admin, ip);
  }
}
