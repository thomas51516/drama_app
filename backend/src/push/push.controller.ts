import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  NotificationsPageDto,
  NotificationsQueryDto,
  RegisterPushDeviceDto,
} from './dto/push.dto.js';
import { PushService } from './push.service.js';
import { UuidPipe } from '../common/pipes/uuid.pipe.js';

/** Appareils push et historique des notifications (M-54, contrat v1.3). Jeton utilisateur obligatoire. */
@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@Controller('me')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Put('devices/push')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Enregistrer le jeton FCM de l’appareil (upsert par jeton, lié au compte courant)',
  })
  @ApiNoContentResponse()
  registerDevice(
    @Body() dto: RegisterPushDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.push.registerDevice(user.id, dto);
  }

  @Delete('devices/push/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Oublier un jeton FCM (déconnexion, désinstallation)' })
  @ApiParam({ name: 'token' })
  @ApiNoContentResponse()
  removeDevice(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.push.removeDevice(user.id, token);
  }

  @Get('notifications')
  @ApiOperation({
    summary: 'Historique in-app des notifications, de la plus récente à la plus ancienne',
  })
  @ApiOkResponse({ type: NotificationsPageDto })
  listNotifications(
    @Query() query: NotificationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationsPageDto> {
    return this.push.listNotifications(user.id, query);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marquer une notification comme lue (idempotent)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'NOTIFICATION_NOT_FOUND' })
  markRead(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.push.markRead(user.id, id);
  }
}
