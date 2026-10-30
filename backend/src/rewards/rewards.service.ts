import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditService, diffChanges } from '../admin/audit/audit.service.js';
import { type SupportedLanguage } from '../common/i18n/accept-language.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import {
  dayKey,
  startOfToday,
  startOfTomorrow,
  startOfWeek,
  timezoneForCountry,
} from '../common/time/local-day.js';
import { type RewardTask } from '../generated/prisma/client.js';
import { MonetizationSettingsService } from '../monetization/monetization-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import { planCheckin } from './checkin.js';
import {
  type AdminRewardTaskDto,
  type CheckinClaimResultDto,
  type CheckinStatusDto,
  type ClaimTaskResultDto,
  type RewardTaskDto,
  type RewardTasksDto,
  type UpdateRewardTaskDto,
} from './dto/rewards.dto.js';
import { taskText } from './reward-tasks.catalog.js';
import {
  periodExpiresAt,
  periodKey,
  type ProgressSignals,
  taskProgress,
  taskStatus,
} from './task-progress.js';

const TASK_FIELDS = ['coins', 'target', 'isActive'] as const;

/**
 * Récompenses (§4.5, S08-BE-04, M-41, B-08) : check-in quotidien sur 7 jours et tâches. Le jour civil
 * est celui du fuseau du pays du compte ; chaque crédit est une ligne BONUS du grand livre écrite par
 * `WalletService.creditBonus` ; l'idempotence repose sur `checkin_claims (user, day)` et
 * `reward_task_claims (user, task, period)`.
 */
@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly settings: MonetizationSettingsService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ check-in (M-40)

  async getCheckin(userId: string, now = new Date()): Promise<CheckinStatusDto> {
    const { tz } = await this.userContext(userId);
    const settings = await this.checkinSettings();
    const last = await this.lastCheckin(userId);
    const plan = planCheckin(last, dayKey(now, tz), settings);
    return {
      scale: settings.scale,
      streakDay: plan.streakDay,
      claimedToday: plan.claimedToday,
      nextClaimAt: (plan.claimedToday ? startOfTomorrow(now, tz) : now).toISOString(),
      resetOnMiss: settings.resetOnMiss,
    };
  }

  async claimCheckin(
    userId: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<CheckinClaimResultDto> {
    const { tz } = await this.userContext(userId);
    const settings = await this.checkinSettings();
    const today = dayKey(now, tz);
    const plan = planCheckin(await this.lastCheckin(userId), today, settings);
    const nextClaimAt = startOfTomorrow(now, tz).toISOString();

    const result = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO checkin_claims (id, user_id, day, streak_day, coins, idempotency_key, created_at)
        VALUES (gen_random_uuid(), ${userId}::uuid, ${today}, ${plan.nextDay}, ${plan.coins}, ${idempotencyKey}, now())
        ON CONFLICT (user_id, day) DO NOTHING
        RETURNING id`;
      if (inserted.length === 0) {
        const existing = await tx.checkinClaim.findUniqueOrThrow({
          where: { userId_day: { userId, day: today } },
        });
        if (existing.idempotencyKey === idempotencyKey) {
          return { day: existing.streakDay, coins: existing.coins, replay: true };
        }
        throw new ConflictException({
          code: 'CHECKIN_ALREADY_CLAIMED',
          message: 'Daily check-in already claimed today',
          details: { nextClaimAt },
        });
      }
      await this.wallet.creditBonus(
        tx,
        userId,
        {
          amount: plan.coins,
          referenceType: 'checkin',
          referenceId: inserted[0].id,
          idempotencyKey: `checkin:${userId}:${today}`,
          note: `Daily check-in day ${plan.nextDay}`,
        },
        now,
      );
      return { day: plan.nextDay, coins: plan.coins, replay: false };
    });
    if (!result.replay) {
      this.logger.log(`Check-in ${userId} day ${result.day}: +${result.coins} bonus coins`);
    }
    return {
      day: result.day,
      coins: result.coins,
      wallet: await this.wallet.getWallet(userId, now),
    };
  }

  // ------------------------------------------------------------------ tâches (M-41)

  async listTasks(
    userId: string,
    lang: SupportedLanguage,
    now = new Date(),
  ): Promise<RewardTasksDto> {
    const { tz, profile } = await this.userContext(userId);
    const tasks = await this.activeTasks();
    if (tasks.length === 0) return { tasks: [] };
    const signals = await this.signals(userId, profile, tz, now);
    const keys = tasks.map((t) => ({ taskKey: t.key, periodKey: periodKey(t.period, now, tz) }));
    const claims = await this.prisma.rewardTaskClaim.findMany({
      where: { userId, OR: keys },
      select: { taskKey: true },
    });
    const claimed = new Set(claims.map((c) => c.taskKey));
    return {
      tasks: tasks.map((t) => this.toTaskDto(t, signals, claimed.has(t.key), lang, tz, now)),
    };
  }

  async claimTask(
    userId: string,
    taskKey: string,
    idempotencyKey: string,
    now = new Date(),
  ): Promise<ClaimTaskResultDto> {
    const task = await this.prisma.rewardTask.findUnique({ where: { key: taskKey } });
    if (!task || !task.isActive) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Unknown reward task' });
    }
    const { tz, profile } = await this.userContext(userId);
    const signals = await this.signals(userId, profile, tz, now);
    const progress = taskProgress(task.key, signals);
    const period = periodKey(task.period, now, tz);
    if (progress < task.target) {
      throw notClaimable('in_progress', { progress, target: task.target });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO reward_task_claims (id, user_id, task_key, period_key, coins, idempotency_key, created_at)
        VALUES (gen_random_uuid(), ${userId}::uuid, ${task.key}, ${period}, ${task.coins}, ${idempotencyKey}, now())
        ON CONFLICT (user_id, task_key, period_key) DO NOTHING
        RETURNING id`;
      if (inserted.length === 0) {
        const existing = await tx.rewardTaskClaim.findUniqueOrThrow({
          where: { userId_taskKey_periodKey: { userId, taskKey: task.key, periodKey: period } },
        });
        if (existing.idempotencyKey === idempotencyKey)
          return { coins: existing.coins, replay: true };
        throw notClaimable('already_claimed', { periodKey: period });
      }
      await this.wallet.creditBonus(
        tx,
        userId,
        {
          amount: task.coins,
          referenceType: 'reward_task',
          referenceId: inserted[0].id,
          idempotencyKey: `task:${userId}:${task.key}:${period}`,
          note: `Reward task ${task.key}`,
        },
        now,
      );
      return { coins: task.coins, replay: false };
    });
    if (!result.replay) this.logger.log(`Task ${task.key} claimed by ${userId}: +${result.coins}`);
    return { coins: result.coins, wallet: await this.wallet.getWallet(userId, now) };
  }

  // ------------------------------------------------------------------ admin (B-08)

  async adminListTasks(): Promise<AdminRewardTaskDto[]> {
    const rows = await this.prisma.rewardTask.findMany({
      orderBy: [{ position: 'asc' }, { key: 'asc' }],
    });
    return rows.map(toAdminTaskDto);
  }

  async adminUpdateTask(
    key: string,
    dto: UpdateRewardTaskDto,
    admin: AuthenticatedAdmin,
    ip?: string,
  ): Promise<AdminRewardTaskDto> {
    const before = await this.prisma.rewardTask.findUnique({ where: { key } });
    if (!before)
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Unknown reward task' });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.rewardTask.update({ where: { key }, data: dto });
      const { oldValue, newValue, changed } = diffChanges(
        before as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
        TASK_FIELDS,
      );
      if (changed.length > 0) {
        await this.audit.record(
          {
            actor: admin,
            action: 'reward_task.update',
            targetType: 'reward_task',
            targetId: key,
            oldValue,
            newValue,
            ip,
          },
          tx,
        );
      }
      return row;
    });
    return toAdminTaskDto(updated);
  }

  // ------------------------------------------------------------------ interne

  private async checkinSettings() {
    const s = await this.settings.get();
    return { scale: s.checkinDays, resetOnMiss: s.checkinResetOnMiss };
  }

  private lastCheckin(userId: string) {
    return this.prisma.checkinClaim.findFirst({
      where: { userId },
      orderBy: { day: 'desc' },
      select: { day: true, streakDay: true },
    });
  }

  private activeTasks(): Promise<RewardTask[]> {
    return this.prisma.rewardTask.findMany({
      where: { isActive: true },
      orderBy: [{ position: 'asc' }, { key: 'asc' }],
    });
  }

  private async userContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { country: true, displayName: true, language: true },
    });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    return { tz: timezoneForCountry(user.country), profile: user };
  }

  /** Signaux serveur de progression (watch_progress, appareils push, événements, favoris, profil). */
  private async signals(
    userId: string,
    profile: ProgressSignals['profile'],
    tz: string,
    now: Date,
  ): Promise<ProgressSignals> {
    const [
      completedToday,
      completedThisWeek,
      pushDevices,
      pushPermissionEvents,
      shareEvents,
      favorites,
    ] = await Promise.all([
      this.prisma.watchProgress.count({
        where: { userId, completed: true, updatedAt: { gte: startOfToday(now, tz) } },
      }),
      this.prisma.watchProgress.count({
        where: { userId, completed: true, updatedAt: { gte: startOfWeek(now, tz) } },
      }),
      this.prisma.pushDevice.count({ where: { userId } }),
      this.prisma.analyticsEvent.count({ where: { userId, name: 'push_permission_granted' } }),
      this.prisma.analyticsEvent.count({ where: { userId, name: 'share' } }),
      this.prisma.favorite.count({ where: { userId } }),
    ]);
    return {
      completedToday,
      completedThisWeek,
      pushDevices,
      pushPermissionEvents,
      shareEvents,
      favorites,
      profile,
    };
  }

  private toTaskDto(
    task: RewardTask,
    signals: ProgressSignals,
    claimed: boolean,
    lang: SupportedLanguage,
    tz: string,
    now: Date,
  ): RewardTaskDto {
    const progress = Math.min(taskProgress(task.key, signals), task.target);
    return {
      id: task.key,
      key: task.key,
      ...taskText(task.key, lang),
      coins: task.coins,
      target: task.target,
      progress,
      status: taskStatus(progress, task.target, claimed),
      expiresAt: periodExpiresAt(task.period, now, tz)?.toISOString() ?? null,
    };
  }
}

function notClaimable(reason: string, details: Record<string, unknown>): HttpException {
  return new HttpException(
    {
      code: 'TASK_NOT_CLAIMABLE',
      message: 'Task is not claimable',
      details: { reason, ...details },
    },
    HttpStatus.CONFLICT,
  );
}

export function toAdminTaskDto(t: RewardTask): AdminRewardTaskDto {
  return {
    key: t.key,
    title: taskText(t.key, 'fr').title,
    coins: t.coins,
    target: t.target,
    period: t.period,
    isActive: t.isActive,
    position: t.position,
    updatedAt: t.updatedAt.toISOString(),
  };
}
