import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { WalletDto, WalletTransactionsDto, WalletTransactionsQueryDto } from './dto/wallet.dto.js';
import { WalletService } from './wallet.service.js';

/** Portefeuille (M-32, S07-BE-04, contrat v1.4). Le serveur fait foi sur les soldes (§8.4). */
@ApiTags('wallet')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({
    summary: 'Soldes de pièces (achetées, bonus, total) et lots bonus à expirer',
    description:
      'Projection du grand livre `coin_ledger`. Les pièces bonus sont consommées avant les achetées, du lot le plus proche de l’expiration au plus lointain ; les lots échus sont passés en EXPIRY à la lecture.',
  })
  @ApiOkResponse({ type: WalletDto })
  get(@CurrentUser() user: AuthenticatedUser): Promise<WalletDto> {
    return this.wallet.getWallet(user.id);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Historique du grand livre (paginé, filtre par type)',
    description:
      'Une ligne par variation de solde : PURCHASE, BONUS, UNLOCK, ADJUSTMENT, EXPIRY, REFUND, MERGE.',
  })
  @ApiOkResponse({ type: WalletTransactionsDto })
  transactions(
    @Query() query: WalletTransactionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WalletTransactionsDto> {
    return this.wallet.listTransactions(user.id, query);
  }
}
