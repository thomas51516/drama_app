import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard.js';
import { AdminRoute } from '../common/decorators/admin-route.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { ReconciliationDto, ReconciliationQueryDto } from './dto/topup.dto.js';
import { previousDay, TopupReconciliationService } from './reconciliation.service.js';

/** Réconciliation des recharges mobile money (B-11, S09-BE-02). Rôles MONETIZATION et ADMIN. */
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
@Controller('admin/topup')
export class AdminTopupController {
  constructor(private readonly reconciliation: TopupReconciliationService) {}

  @Get('reconciliation')
  @ApiOperation({
    summary: 'Réconciliation des recharges d’un jour (UTC)',
    description:
      'Commandes payées du jour rapprochées des lignes PURCHASE du grand livre : `credited` = commandes dont la ligne existe avec le bon montant ; `mismatches` = `NOT_CREDITED`, `AMOUNT_MISMATCH`, `LEDGER_WITHOUT_ORDER`. La tâche planifiée `topup-reconciliation` journalise le même rapport chaque jour pour la veille.',
  })
  @ApiOkResponse({ type: ReconciliationDto })
  reconcile(@Query() query: ReconciliationQueryDto): Promise<ReconciliationDto> {
    return this.reconciliation.reconcile(query.date ?? previousDay(new Date()));
  }
}
