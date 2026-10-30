import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { isSupportedLanguage, pickLanguage } from '../common/i18n/accept-language.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import {
  ContactDto,
  ContactResultDto,
  FaqPublicDto,
  FaqQueryDto,
  TicketListDto,
  TicketListQueryDto,
} from './dto/help.dto.js';
import { FaqService } from './faq.service.js';
import { SupportService } from './support.service.js';

/** Centre d'aide côté app (M-53, contrat v1.3). */
@ApiTags('help')
@Controller('help')
export class HelpController {
  constructor(
    private readonly faq: FaqService,
    private readonly support: SupportService,
  ) {}

  @Public()
  @Get('faq')
  @ApiOperation({
    summary: 'FAQ publiée, par catégorie, dans la langue demandée (repli fr)',
    description: '`lang` prime sur `Accept-Language`. Mise en cache 5 min par langue.',
  })
  @ApiHeader({ name: 'Accept-Language', required: false })
  @ApiOkResponse({ type: FaqPublicDto })
  publicFaq(
    @Query() query: FaqQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<FaqPublicDto> {
    const lang =
      query.lang && isSupportedLanguage(query.lang) ? query.lang : pickLanguage(acceptLanguage);
    return this.faq.publicFaq(lang);
  }

  @Post('contact')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Envoyer une demande au support (5 par jour et par utilisateur)',
    description:
      'Crée un ticket rattaché au compte courant. Si `email` est fourni, une confirmation est envoyée (journalisée en dev). La réponse du support arrive dans `GET /me/notifications` (`support_reply`) et `GET /help/tickets`.',
  })
  @ApiCreatedResponse({ type: ContactResultDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'RATE_LIMITED' })
  contact(
    @Body() dto: ContactDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ContactResultDto> {
    return this.support.contact(user.id, dto);
  }

  @Get('tickets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mes demandes au support, avec les réponses' })
  @ApiOkResponse({ type: TicketListDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
  myTickets(
    @Query() query: TicketListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketListDto> {
    return this.support.listMine(user.id, query);
  }
}
