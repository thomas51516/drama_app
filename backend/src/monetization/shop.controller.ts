import { Controller, Get } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { ViewerCountry } from '../common/decorators/viewer-country.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ShopDto } from './dto/monetization.dto.js';
import { ShopService } from './shop.service.js';

/** Boutique (M-30, contrat v1.4). Publique : un jeton permet de replier sur le pays du compte. */
@ApiTags('billing')
@ApiBearerAuth()
@Controller('shop')
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Packs de pièces et formules VIP, prix en devise locale (M-30)',
    description:
      'Devise déduite de `X-Country` (UEMOA → XOF, NG → NGN, GH → GHS, zone euro → EUR, sinon USD), sinon du pays du compte. Un article sans prix dans la devise est proposé en USD ; sans prix USD il est masqué. `welcomeOffer` est toujours `null` au MVP (M-24, P2).',
  })
  @ApiHeader({ name: 'X-Country', required: false, example: 'TG' })
  @ApiOkResponse({ type: ShopDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_ERROR (X-Country)' })
  async getShop(
    @ViewerCountry() country?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<ShopDto> {
    let resolved: string | null | undefined = country;
    if (!resolved && user) {
      const account = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { country: true },
      });
      resolved = account?.country;
    }
    return this.shop.getShop(resolved);
  }
}
