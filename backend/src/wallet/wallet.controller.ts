import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { type AuthenticatedUser } from '../common/request-context.js';
import { WalletService } from './wallet.service.js';

@ApiExcludeController()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  // TODO S07-BE-04
  @Get()
  get(@CurrentUser() user: AuthenticatedUser): never {
    return this.wallet.getWallet(user.id);
  }

  // TODO S07-BE-04
  @Get('transactions')
  transactions(@CurrentUser() user: AuthenticatedUser): never {
    return this.wallet.listTransactions(user.id);
  }
}
