import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  publishedSeriesWhere,
  type ViewerContext,
  visibleEpisodeWhere,
} from '../catalog/catalog.where.js';
import { computeAccess, EntitlementService } from '../catalog/entitlement.service.js';
import { dayKey, startOfToday, timezoneForCountry } from '../common/time/local-day.js';
import { AppConfig } from '../config/app-config.js';
import { type AdSession } from '../generated/prisma/client.js';
import { MonetizationSettingsService } from '../monetization/monetization-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { UnlockService } from '../unlock/unlock.service.js';
import {
  type AdEligibilityDto,
  type AdIneligibilityReason,
  type AdRewardAckDto,
  type AdSessionCreatedDto,
  type AdSessionStatusDto,
} from './dto/ads.dto.js';
import { AD_SSV_VERIFIER, type AdSsvVerifier, parseSsvQuery } from './ssv/ad-ssv-verifier.js';

export const AD_SESSION_TTL_MS = 10 * 60_000;
export const FAKE_AD_UNIT_ID = 'fake-rewarded';

/**
 * Pub récompensée (M-22, S08-BE-03, §8.4) : l'app ouvre une session (`POST /ads/sessions`) et
 * transmet `customData` à la régie ; seul le callback SSV signé crée le déblocage (`method: ad`,
 * sans débit), idempotent par `transaction_id`. Plafond quotidien `adDailyCap` par utilisateur,
 * jour civil du fuseau du pays, compteur Redis `ads:cap:<user>:<jour>` (repli : compte en base).
 */
@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    private readonly settings: MonetizationSettingsService,
    private readonly entitlements: EntitlementService,
    private readonly unlock: UnlockService,
    @Inject(AD_SSV_VERIFIER) private readonly verifier: AdSsvVerifier,
  ) {}

  async eligibility(
    userId: string,
    episodeId: string,
    viewer: ViewerContext,
    now = new Date(),
  ): Promise<AdEligibilityDto> {
    const episode = await this.prisma.episode.findFirst({
      where: {
        id: episodeId,
        ...visibleEpisodeWhere(now),
        series: publishedSeriesWhere(viewer, now),
      },
      include: { series: { select: { id: true, freeEpisodeCount: true, adUnlockEnabled: true } } },
    });
    if (!episode)
      throw new NotFoundException({ code: 'EPISODE_NOT_FOUND', message: 'Episode not found' });
    const [dailyCap, used, entitlements] = await Promise.all([
      this.settings.get().then((s) => s.adDailyCap),
      this.usedToday(userId, now),
      this.entitlements.forViewer(userId, [episode.id]),
    ]);
    const remainingToday = Math.max(0, dailyCap - used);
    const provider = this.config.ads.provider;
    const adUnitId =
      provider === 'admob' ? (this.config.ads.admobRewardedUnitId ?? null) : FAKE_AD_UNIT_ID;
    let reason: AdIneligibilityReason | undefined;
    if (!adUnitId) reason = 'NO_PROVIDER';
    else if (computeAccess(episode, episode.series, entitlements) !== 'locked')
      reason = 'ALREADY_UNLOCKED';
    else if (!episode.series.adUnlockEnabled) reason = 'SERIES_NOT_ELIGIBLE';
    else if (remainingToday <= 0) reason = 'CAP_REACHED';
    return {
      eligible: reason === undefined,
      remainingToday,
      dailyCap,
      ...(reason ? { reason } : {}),
      adUnitId,
      provider,
    };
  }

  async createSession(
    userId: string,
    episodeId: string,
    viewer: ViewerContext,
    now = new Date(),
  ): Promise<AdSessionCreatedDto> {
    const eligibility = await this.eligibility(userId, episodeId, viewer, now);
    if (!eligibility.eligible) {
      throw new ConflictException({
        code: 'AD_NOT_ELIGIBLE',
        message: 'Rewarded ad not available for this episode',
        details: { reason: eligibility.reason, remainingToday: eligibility.remainingToday },
      });
    }
    const session = await this.prisma.adSession.create({
      data: {
        userId,
        episodeId,
        nonce: randomBytes(16).toString('hex'),
        expiresAt: new Date(now.getTime() + AD_SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      customData: customDataFor(session),
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async getSession(
    userId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<AdSessionStatusDto> {
    let session = await this.prisma.adSession.findFirst({ where: { id: sessionId, userId } });
    if (!session)
      throw new NotFoundException({
        code: 'AD_SESSION_NOT_FOUND',
        message: 'Ad session not found',
      });
    if (session.status === 'PENDING' && session.expiresAt <= now) {
      session = await this.prisma.adSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
    }
    const unlocked = await this.prisma.unlock.findUnique({
      where: { userId_episodeId: { userId, episodeId: session.episodeId } },
      select: { id: true },
    });
    return { status: session.status, unlocked: unlocked !== null };
  }

  /**
   * Callback SSV (GET ou POST, paramètres dans la chaîne de requête). Signature vérifiée sur le
   * contenu brut avant toute lecture ; ensuite toujours 200 (la régie rejoue les autres codes).
   */
  async rewardFromSsv(rawQuery: string, now = new Date()): Promise<AdRewardAckDto> {
    const { content, params } = parseSsvQuery(rawQuery);
    if (!params.signature || !params.transactionId) {
      throw new BadRequestException({
        code: 'AD_CALLBACK_INVALID',
        message: 'Missing signature or transaction_id',
      });
    }
    if (!(await this.verifier.verify(content, params.signature, params.keyId))) {
      this.logger.warn(`SSV callback rejected: bad signature (tx ${params.transactionId})`);
      throw new UnauthorizedException({
        code: 'INVALID_AD_SIGNATURE',
        message: 'Invalid SSV signature',
      });
    }

    const already = await this.prisma.adSession.findUnique({
      where: { transactionId: params.transactionId },
    });
    if (already) return { accepted: already.status === 'REWARDED', episodeId: already.episodeId };

    const [sessionId, nonce] = (params.customData ?? '').split(':');
    const session =
      sessionId && isUuid(sessionId)
        ? await this.prisma.adSession.findUnique({ where: { id: sessionId } })
        : null;
    if (!session || session.nonce !== nonce) return refused('unknown_session');
    if (params.userId && params.userId !== session.userId)
      return refused('user_mismatch', session.episodeId);
    if (session.status !== 'PENDING') return refused('session_closed', session.episodeId);
    if (session.expiresAt <= now) {
      await this.prisma.adSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      return refused('session_expired', session.episodeId);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { country: true },
    });
    const tz = timezoneForCountry(user?.country);
    const dailyCap = (await this.settings.get()).adDailyCap;
    if ((await this.usedToday(session.userId, now, tz)) >= dailyCap) {
      await this.prisma.adSession.update({
        where: { id: session.id },
        data: { status: 'REJECTED' },
      });
      return refused('cap_reached', session.episodeId);
    }

    const rewarded = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.adSession.updateMany({
        where: { id: session.id, status: 'PENDING' },
        data: { status: 'REWARDED', transactionId: params.transactionId, rewardedAt: now },
      });
      if (claimed.count === 0) return false;
      await this.unlock.recordWithoutDebit(
        tx,
        session.userId,
        session.episodeId,
        'AD',
        `ad:${session.id}`,
      );
      return true;
    });
    if (!rewarded) return refused('session_closed', session.episodeId);
    await this.incrementUsed(session.userId, now, tz);
    this.logger.log(
      `Ad reward: episode ${session.episodeId} unlocked for ${session.userId} (tx ${params.transactionId})`,
    );
    return { accepted: true, episodeId: session.episodeId };
  }

  // ------------------------------------------------------------------ plafond quotidien

  private capKey(userId: string, now: Date, tz: string): string {
    return `ads:cap:${userId}:${dayKey(now, tz)}`;
  }

  async usedToday(userId: string, now = new Date(), tz?: string): Promise<number> {
    const zone = tz ?? (await this.userTimezone(userId));
    try {
      const raw = await this.redis.client.get(this.capKey(userId, now, zone));
      if (raw !== null) return Number.parseInt(raw, 10) || 0;
    } catch (err) {
      this.logger.warn(
        `Redis unavailable for ad cap, counting in database: ${(err as Error).message}`,
      );
    }
    return this.prisma.adSession.count({
      where: { userId, status: 'REWARDED', rewardedAt: { gte: startOfToday(now, zone) } },
    });
  }

  private async incrementUsed(userId: string, now: Date, tz: string): Promise<void> {
    try {
      const key = this.capKey(userId, now, tz);
      await this.redis.client
        .multi()
        .incr(key)
        .expire(key, 2 * 86_400)
        .exec();
    } catch (err) {
      this.logger.warn(`Redis unavailable for ad cap increment: ${(err as Error).message}`);
    }
  }

  private async userTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { country: true },
    });
    return timezoneForCountry(user?.country);
  }
}

export function customDataFor(session: Pick<AdSession, 'id' | 'nonce'>): string {
  return `${session.id}:${session.nonce}`;
}

function refused(reason: string, episodeId: string | null = null): AdRewardAckDto {
  return { accepted: false, episodeId, reason };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
