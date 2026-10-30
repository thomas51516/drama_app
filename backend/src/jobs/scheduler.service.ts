import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AdminCampaignsService } from '../admin/campaigns/admin-campaigns.service.js';
import { AppConfig } from '../config/app-config.js';
import { RedisService } from '../redis/redis.service.js';
import { TopupReconciliationService } from '../topup/reconciliation.service.js';
import { TopupService } from '../topup/topup.service.js';
import { AccountDeletionService } from '../users/account-deletion.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { PublishSchedulerService } from './publish-scheduler.service.js';

export const SCHEDULER_TICK_MS = 60_000;

interface ScheduledTask {
  name: string;
  run: (now: Date) => Promise<unknown>;
}

/**
 * Tâches planifiées hébergées dans le processus API (`SCHEDULER_ENABLED`, désactivé en tests et à
 * l'export OpenAPI) : un passage par minute, chaque tâche protégée par un verrou Redis `lock:job:<nom>`
 * pour qu'une seule instance l'exécute quand l'API est répliquée.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  readonly tasks: ScheduledTask[];

  constructor(
    private readonly config: AppConfig,
    private readonly redis: RedisService,
    publish: PublishSchedulerService,
    deletion: AccountDeletionService,
    campaigns: AdminCampaignsService,
    wallet: WalletService,
    topup: TopupService,
    reconciliation: TopupReconciliationService,
  ) {
    this.tasks = [
      { name: 'publish-scheduler', run: (now) => publish.runOnce(now) },
      { name: 'account-anonymiser', run: (now) => deletion.runOnce(now) },
      { name: 'campaign-scheduler', run: (now) => campaigns.dispatchDue(now) },
      { name: 'bonus-expiry', run: (now) => wallet.expireBonuses(now) },
      { name: 'topup-expiry', run: (now) => topup.expirePending(now) },
      { name: 'topup-reconciliation', run: (now) => reconciliation.runDaily(now) },
    ];
  }

  onModuleInit(): void {
    if (!this.config.schedulerEnabled) return;
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    this.timer.unref();
    setTimeout(() => void this.tick(), 5_000).unref();
    this.logger.log(`Scheduler started (${this.tasks.map((t) => t.name).join(', ')}, every 60 s)`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const task of this.tasks) {
        if (!(await this.acquire(task.name))) continue;
        try {
          await task.run(now);
        } catch (err) {
          this.logger.error(`Task ${task.name} failed: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Verrou court (55 s) : sans Redis, la tâche s'exécute quand même (instance unique en dev). */
  private async acquire(name: string): Promise<boolean> {
    try {
      const ok = await this.redis.client.set(`lock:job:${name}`, '1', 'PX', 55_000, 'NX');
      return ok === 'OK';
    } catch {
      return true;
    }
  }
}
