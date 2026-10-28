import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotImplementedResponse,
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

/** Portefeuille (§8.2). Planifié S07-BE-04 : les deux routes répondent 501 jusqu'au sprint 7. */
@ApiTags('wallet')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'UNAUTHENTICATED | INVALID_TOKEN' })
@ApiNotImplementedResponse({ type: ApiErrorDto, description: 'NOT_IMPLEMENTED' })
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  // TODO S07-BE-04
  @Get()
  @ApiOperation({ summary: 'Soldes de pièces (planifié S07-BE-04)' })
  @ApiOkResponse({ type: WalletDto })
  get(@CurrentUser() user: AuthenticatedUser): never {
    return this.wallet.getWallet(user.id);
  }

  // TODO S07-BE-04
  @Get('transactions')
  @ApiOperation({
    summary: 'Historique du grand livre, pagination par curseur (planifié S07-BE-04)',
  })
  @ApiOkResponse({ type: WalletTransactionsDto })
  transactions(
    @Query() _query: WalletTransactionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): never {
    return this.wallet.listTransactions(user.id);
  }
}
