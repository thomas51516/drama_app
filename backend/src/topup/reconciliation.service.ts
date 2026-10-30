import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { type ReconciliationDto, type ReconciliationMismatchDto } from './dto/topup.dto.js';

/**
 * Réconciliation quotidienne mobile money (§10 « exigences communes », S09-BE-02) : commandes PAYÉES
 * du jour (UTC) rapprochées des lignes PURCHASE du grand livre ; écarts journalisés par la tâche
 * `topup-reconciliation` (une exécution par jour, verrou Redis) et consultables en back-office (B-11).
 */
@Injectable()
export class TopupReconciliationService {
  private readonly logger = new Logger(TopupReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async reconcile(date: string, now = new Date()): Promise<ReconciliationDto> {
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) throw new Error(`Invalid date ${date}`);
    const end = new Date(start.getTime() + 86_400_000);

    const [created, paidOrders, ledgerRows] = await Promise.all([
      this.prisma.topupOrder.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.topupOrder.findMany({
        where: { status: 'PAID', paidAt: { gte: start, lt: end } },
        select: {
          id: true,
          userId: true,
          coins: true,
          currency: true,
          amountMinor: true,
          purchaseId: true,
        },
      }),
      this.prisma.$queryRaw<{ purchase_id: string; user_id: string; amount: number }[]>`
        SELECT p.id AS purchase_id, p.user_id, COALESCE(SUM(l.amount), 0)::int AS amount
        FROM purchases p
        LEFT JOIN coin_ledger l
          ON l.reference_type = 'purchase' AND l.reference_id = p.id::text AND l.type = 'PURCHASE'
        WHERE p.provider = 'MOBILE_MONEY' AND p.created_at >= ${start} AND p.created_at < ${end}
        GROUP BY p.id, p.user_id`,
    ]);

    const creditedByPurchase = new Map<string, { userId: string; amount: number }>();
    for (const row of ledgerRows)
      creditedByPurchase.set(row.purchase_id, { userId: row.user_id, amount: row.amount });

    const mismatches: ReconciliationMismatchDto[] = [];
    let credited = 0;
    const amounts = new Map<string, number>();
    for (const order of paidOrders) {
      amounts.set(order.currency, (amounts.get(order.currency) ?? 0) + order.amountMinor);
      const line = order.purchaseId ? creditedByPurchase.get(order.purchaseId) : undefined;
      const creditedCoins = line?.amount ?? 0;
      if (creditedCoins === order.coins) credited += 1;
      else {
        mismatches.push({
          orderId: order.id,
          userId: order.userId,
          reason: creditedCoins === 0 ? 'NOT_CREDITED' : 'AMOUNT_MISMATCH',
          expectedCoins: order.coins,
          creditedCoins,
        });
      }
    }
    const purchaseIdsWithOrder = new Set(paidOrders.map((o) => o.purchaseId).filter(Boolean));
    const ordersByPurchase = await this.prisma.topupOrder.findMany({
      where: { purchaseId: { in: [...creditedByPurchase.keys()] } },
      select: { purchaseId: true },
    });
    const anyOrder = new Set(ordersByPurchase.map((o) => o.purchaseId));
    for (const [purchaseId, line] of creditedByPurchase) {
      if (purchaseIdsWithOrder.has(purchaseId) || anyOrder.has(purchaseId)) continue;
      if (line.amount === 0) continue;
      mismatches.push({
        orderId: null,
        userId: line.userId,
        reason: 'LEDGER_WITHOUT_ORDER',
        expectedCoins: 0,
        creditedCoins: line.amount,
      });
    }

    return {
      date,
      orders: created,
      paid: paidOrders.length,
      credited,
      amounts: [...amounts.entries()]
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      mismatches,
      generatedAt: now.toISOString(),
    };
  }

  /** Tâche quotidienne : réconcilie la veille (UTC) une seule fois et journalise les écarts. */
  async runDaily(now = new Date()): Promise<ReconciliationDto | null> {
    const date = previousDay(now);
    try {
      const ok = await this.redis.client.set(
        `job:topup-reconciliation:${date}`,
        '1',
        'EX',
        3 * 86_400,
        'NX',
      );
      if (ok !== 'OK') return null;
    } catch {
      return null;
    }
    const report = await this.reconcile(date, now);
    if (report.mismatches.length > 0) {
      this.logger.warn(
        `Top-up reconciliation ${date}: ${report.mismatches.length} mismatch(es) — ${JSON.stringify(report.mismatches)}`,
      );
    } else {
      this.logger.log(
        `Top-up reconciliation ${date}: ${report.paid} paid, ${report.credited} credited, no mismatch`,
      );
    }
    return report;
  }
}

export function previousDay(now: Date): string {
  return new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
}
