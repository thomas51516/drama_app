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
  ApiBearerAuth,
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
import { type AuthenticatedAdmin } from '../common/request-context.js';
import {
  CreateFaqEntryDto,
  FaqEntryDto,
  ReorderFaqDto,
  ReplyTicketDto,
  TicketDto,
  TicketListDto,
  TicketListQueryDto,
  UpdateFaqEntryDto,
} from './dto/help.dto.js';
import { FaqService } from './faq.service.js';
import { SupportService } from './support.service.js';

/** Gestion de la FAQ (B-03bis). Rôles EDITOR, SUPPORT, ADMIN. */
@ApiTags('admin-help')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('EDITOR', 'SUPPORT', 'ADMIN')
@Controller('admin/faq')
export class AdminFaqController {
  constructor(private readonly faq: FaqService) {}

  @Get()
  @ApiOperation({ summary: 'Toutes les entrées de FAQ (publiées ou non), dans l’ordre' })
  @ApiOkResponse({ type: [FaqEntryDto] })
  list(): Promise<FaqEntryDto[]> {
    return this.faq.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une entrée (`fr` obligatoire, autres langues facultatives)' })
  @ApiCreatedResponse({ type: FaqEntryDto })
  create(
    @Body() dto: CreateFaqEntryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<FaqEntryDto> {
    return this.faq.create(dto, admin, ip);
  }

  @Put('order')
  @ApiOperation({ summary: 'Réordonner (identifiants dans le nouvel ordre)' })
  @ApiOkResponse({ type: [FaqEntryDto] })
  reorder(
    @Body() dto: ReorderFaqDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<FaqEntryDto[]> {
    return this.faq.reorder(dto.ids, admin, ip);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une entrée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: FaqEntryDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'FAQ_ENTRY_NOT_FOUND' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFaqEntryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<FaqEntryDto> {
    return this.faq.update(id, dto, admin, ip);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une entrée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'FAQ_ENTRY_NOT_FOUND' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<void> {
    return this.faq.remove(id, admin, ip);
  }
}

/** Boîte de réception du support (B-03bis). Rôles SUPPORT et ADMIN. */
@ApiTags('admin-help')
@ApiBearerAuth('admin')
@ApiUnauthorizedResponse({
  type: ApiErrorDto,
  description: 'UNAUTHENTICATED | INVALID_ADMIN_TOKEN',
})
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'FORBIDDEN_ROLE' })
@AdminRoute()
@UseGuards(AdminAuthGuard)
@Roles('SUPPORT', 'ADMIN')
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Tickets (filtre statut), du plus récemment mis à jour au plus ancien' })
  @ApiOkResponse({ type: TicketListDto })
  list(@Query() query: TicketListQueryDto): Promise<TicketListDto> {
    return this.support.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un ticket avec le fil des messages' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: TicketDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'TICKET_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TicketDto> {
    return this.support.get(id);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Répondre (statut ANSWERED, notification in-app `support_reply` + push)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: TicketDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'TICKET_NOT_FOUND' })
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyTicketDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<TicketDto> {
    return this.support.reply(id, dto, admin, ip);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clore un ticket' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: TicketDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'TICKET_NOT_FOUND' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Ip() ip: string,
  ): Promise<TicketDto> {
    return this.support.close(id, admin, ip);
  }
}
