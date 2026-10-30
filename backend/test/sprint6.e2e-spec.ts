/**
 * Sprint 6 de bout en bout (contrat v1.4) : boutique par pays, achat simulé crédité une seule fois,
 * déblocage atomique et idempotent, 402, déblocage automatique par /play, ajustement admin,
 * cohérence grand livre / portefeuille, abonnement VIP et RTDN, utilisateurs en back-office,
 * `current` sur les appareils de confiance, régressions DEF-002/003/004/008/009.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { totpCode } from '../src/common/crypto/totp.js';
import { AppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

process.env.TRANSCODE_PROVIDER = 'webhook';
process.env.TRANSCODE_WORKER_ENABLED = 'false';
process.env.TRANSCODE_WEBHOOK_SECRET ??= 'e2e-transcode-webhook-secret-0123456789';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SMS_PROVIDER = 'console';
process.env.MEDIA_SIGNER = 'plain';
process.env.PUSH_PROVIDER = 'log';
process.env.PUSH_QUEUE_ENABLED = 'false';
process.env.BILLING_VERIFIER = 'fake';
delete process.env.GOOGLE_RTDN_AUTH_TOKEN;

const PASSWORD = 'E2e-Password!2026';
const suffix = `s6${Date.now().toString(36)}`;
const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

describe('Sprint 6 API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const adminEmail = `e2e-admin-${suffix}@drama.local`;
  const adminIds: string[] = [];
  const seriesIds: string[] = [];
  const userIds: string[] = [];
  const packIds: string[] = [];
  const planIds: string[] = [];
  const packSku = `e2e_pack_${suffix}`;
  const planSku = `e2e_vip_${suffix}`;
  let adminToken = '';
  let seriesId = '';
  let restrictedEpisode = '';
  const ep: string[] = [];
  let userA = { id: '', access: '', refresh: '' };
  let userB = { id: '', access: '', refresh: '' };
  let userC = { id: '', access: '', refresh: '' };
  const purchaseToken = `fake:${packSku}:${suffix}`;

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function guest() {
    const res = await api()
      .post('/auth/guest')
      .send({ deviceId: `e2e-${suffix}-${Math.random().toString(36).slice(2, 10)}`, country: 'TG' })
      .expect(201);
    userIds.push(res.body.user.id as string);
    return {
      id: res.body.user.id as string,
      access: res.body.tokens.accessToken as string,
      refresh: res.body.tokens.refreshToken as string,
    };
  }

  async function ledgerEqualsWallet(userId: string) {
    const [wallet, sums] = await Promise.all([
      prisma.wallet.findUniqueOrThrow({ where: { userId } }),
      prisma.coinLedgerEntry.groupBy({ by: ['bucket'], where: { userId }, _sum: { amount: true } }),
    ]);
    const sum = (bucket: 'PURCHASED' | 'BONUS') =>
      sums.find((s) => s.bucket === bucket)?._sum.amount ?? 0;
    expect(wallet.purchasedBalance).toBe(sum('PURCHASED'));
    expect(wallet.bonusBalance).toBe(sum('BONUS'));
    return wallet;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    configureApp(app, app.get(AppConfig));
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const rlKeys = await redis.client.keys('rl:*');
    if (rlKeys.length > 0) await redis.client.del(...rlKeys);

    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const acc = await prisma.adminAccount.create({
      data: { email: adminEmail, displayName: 'E2E ADMIN S6', role: 'ADMIN', passwordHash },
    });
    adminIds.push(acc.id);

    const publishedAt = new Date(Date.now() - 86_400_000);
    const series = await prisma.series.create({
      data: {
        slug: `e2e-s6-${suffix}`,
        title: `E2E Pièces ${suffix}`,
        synopsis: 'Série de test sprint 6',
        genres: [`e2e-genre-${suffix}`],
        status: 'PUBLISHED',
        freeEpisodeCount: 1,
        coinCostPerEpisode: 20,
        publishedAt,
        episodes: {
          create: [1, 2, 3, 4].map((n) => ({
            number: n,
            title: `Épisode ${n}`,
            durationSeconds: 60,
            transcodeStatus: 'READY',
            hlsKey: `hls/e2e/${suffix}/${n}/master.m3u8`,
            publishedAt,
          })),
        },
      },
      include: { episodes: { orderBy: { number: 'asc' } } },
    });
    seriesId = series.id;
    seriesIds.push(series.id);
    ep.push(...series.episodes.map((e) => e.id));

    const restricted = await prisma.series.create({
      data: {
        slug: `e2e-s6-aq-${suffix}`,
        title: `E2E Antarctique ${suffix}`,
        synopsis: 'Série restreinte',
        status: 'PUBLISHED',
        territories: ['AQ'],
        freeEpisodeCount: 5,
        publishedAt,
        episodes: {
          create: [
            {
              number: 1,
              durationSeconds: 60,
              transcodeStatus: 'READY',
              hlsKey: `hls/e2e/${suffix}/aq/master.m3u8`,
              publishedAt,
            },
          ],
        },
      },
      include: { episodes: true },
    });
    seriesIds.push(restricted.id);
    restrictedEpisode = restricted.episodes[0].id;
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.coinLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.purchase.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.auditLog.deleteMany({
        where: { targetType: 'user', targetId: { in: userIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { targetType: 'wallet', targetId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (seriesIds.length > 0) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    if (packIds.length > 0) await prisma.coinPack.deleteMany({ where: { id: { in: packIds } } });
    if (planIds.length > 0) await prisma.vipPlan.deleteMany({ where: { id: { in: planIds } } });
    if (adminIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: adminIds } } });
      await prisma.auditLog.deleteMany({
        where: { actorLabel: { in: adminIds.map((id) => `admin:${id}`) } },
      });
      await prisma.adminAccount.deleteMany({ where: { id: { in: adminIds } } });
    }
    await app.close();
  });

  // ------------------------------------------------------------ back-office : monétisation (B-06, B-08)

  it('admin logs in with rememberDevice and sees its device flagged current (B-13+)', async () => {
    const login = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    expect(login.body.status).toBe('totp_setup_required');
    const verify = await api()
      .post('/admin/auth/totp/verify')
      .send({
        challengeToken: login.body.challengeToken,
        code: totpCode(login.body.secret as string),
        rememberDevice: true,
      })
      .expect(200);
    adminToken = verify.body.accessToken as string;
    const devices = await asAdmin(api().get('/admin/auth/devices')).expect(200);
    expect(devices.body).toHaveLength(1);
    expect(devices.body[0].current).toBe(true);

    // Une session ouverte par mot de passe + deviceToken porte aussi `current`.
    const fast = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD, deviceToken: verify.body.deviceToken })
      .expect(200);
    const again = await api()
      .get('/admin/auth/devices')
      .set('Authorization', `Bearer ${fast.body.accessToken as string}`)
      .expect(200);
    expect(again.body[0].current).toBe(true);
  });

  it('monetization settings, check-in scale, packs and plans are managed and audited', async () => {
    const settings = await asAdmin(api().get('/admin/monetization/settings')).expect(200);
    expect(settings.body).toMatchObject({
      defaultFreeEpisodes: expect.any(Number),
      bonusValidityDays: expect.any(Number),
    });
    const put = await asAdmin(api().put('/admin/monetization/settings'))
      .send(settings.body)
      .expect(200);
    expect(put.body).toEqual(settings.body);

    const checkin = await asAdmin(api().get('/admin/rewards/checkin')).expect(200);
    expect(checkin.body.days).toHaveLength(7);
    await asAdmin(api().put('/admin/rewards/checkin'))
      .send({ days: [1, 2, 3], resetOnMiss: true })
      .expect(400);
    await asAdmin(api().put('/admin/rewards/checkin')).send(checkin.body).expect(200);

    const pack = await asAdmin(api().post('/admin/monetization/packs'))
      .send({
        sku: packSku,
        coins: 50,
        bonusCoins: 5,
        badge: 'Test',
        prices: [
          { currency: 'XOF', amountMinor: 500 },
          { currency: 'USD', amountMinor: 99 },
        ],
      })
      .expect(201);
    packIds.push(pack.body.id as string);
    expect(pack.body).toMatchObject({
      sku: packSku,
      coins: 50,
      bonusCoins: 5,
      isActive: true,
      prices: expect.any(Array),
    });
    await asAdmin(api().post('/admin/monetization/packs'))
      .send({ sku: packSku, coins: 1, prices: [{ currency: 'USD', amountMinor: 1 }] })
      .expect(409);
    const patched = await asAdmin(
      api().patch(`/admin/monetization/packs/${pack.body.id as string}`),
    )
      .send({ badge: 'Populaire' })
      .expect(200);
    expect(patched.body.badge).toBe('Populaire');
    await asAdmin(api().put('/admin/monetization/packs/order'))
      .send({ ids: [pack.body.id] })
      .expect(200);

    const plan = await asAdmin(api().post('/admin/monetization/vip-plans'))
      .send({
        sku: planSku,
        period: 'MONTH',
        trialDays: 3,
        prices: [{ currency: 'USD', amountMinor: 499 }],
      })
      .expect(201);
    planIds.push(plan.body.id as string);
    expect(plan.body).toMatchObject({ sku: planSku, period: 'MONTH', isActive: true });

    const audits = await prisma.auditLog.findMany({
      where: { actorId: adminIds[0] },
      select: { action: true },
    });
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'coin_pack.create',
        'coin_pack.update',
        'coin_pack.reorder',
        'vip_plan.create',
        'rewards.checkin_update',
      ]),
    );
  });

  // ------------------------------------------------------------ boutique et achat (S07-BE-06)

  it('GET /shop prices items in the country currency with USD fallback and validates X-Country', async () => {
    userA = await guest();
    userB = await guest();
    const tg = await bearer(userA.access)(api().get('/shop')).set('X-Country', 'TG').expect(200);
    expect(tg.body.currency).toBe('XOF');
    const ourPack = tg.body.coinPacks.find((p: { sku: string }) => p.sku === packSku);
    expect(ourPack.price).toEqual({ currency: 'XOF', amountMinor: 500 });
    expect(tg.body.welcomeOffer).toBeNull();

    const ng = await api().get('/shop').set('X-Country', 'NG').expect(200);
    expect(ng.body.currency).toBe('NGN');
    expect(ng.body.coinPacks.find((p: { sku: string }) => p.sku === packSku).price).toEqual({
      currency: 'USD',
      amountMinor: 99,
    });
    expect(ng.body.vipPlans.find((p: { sku: string }) => p.sku === planSku)).toMatchObject({
      period: 'MONTH',
      trialDays: 3,
    });

    const bad = await api().get('/shop').set('X-Country', 'ZZZZ').expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('a fake purchase is credited once even when verify is repeated, and refused for another account', async () => {
    const empty = await bearer(userA.access)(api().get('/wallet')).expect(200);
    expect(empty.body).toEqual({
      purchased: 0,
      bonus: 0,
      total: 0,
      autoUnlock: false,
      bonusExpiring: [],
    });

    const first = await bearer(userA.access)(api().post('/billing/google/verify'))
      .send({ purchaseToken, productId: packSku, type: 'inapp', idempotencyKey: randomUUID() })
      .expect(200);
    expect(first.body.status).toBe('credited');
    expect(first.body.wallet).toMatchObject({ purchased: 50, bonus: 5, total: 55 });
    expect(first.body.wallet.bonusExpiring).toHaveLength(1);

    const again = await bearer(userA.access)(api().post('/billing/google/verify'))
      .send({ purchaseToken, productId: packSku, type: 'inapp', idempotencyKey: randomUUID() })
      .expect(200);
    expect(again.body.status).toBe('already_processed');
    expect(again.body.wallet.total).toBe(55);

    const other = await bearer(userB.access)(api().post('/billing/google/verify'))
      .send({ purchaseToken, productId: packSku, type: 'inapp', idempotencyKey: randomUUID() })
      .expect(409);
    expect(other.body.code).toBe('PURCHASE_OWNED_BY_OTHER');

    const invalid = await bearer(userB.access)(api().post('/billing/google/verify'))
      .send({
        purchaseToken: 'not-a-fake-token-at-all',
        productId: packSku,
        type: 'inapp',
        idempotencyKey: randomUUID(),
      })
      .expect(400);
    expect(invalid.body.code).toBe('PURCHASE_INVALID');

    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { purchaseToken } });
    expect(purchase.status).toBe('ACKNOWLEDGED');
    expect(await prisma.coinLedgerEntry.count({ where: { userId: userA.id } })).toBe(2);
    await ledgerEqualsWallet(userA.id);
  });

  // ------------------------------------------------------------ déblocage (S07-BE-02/03)

  it('unlocks an episode atomically (bonus first), replays idempotently and lists series unlocks', async () => {
    const key = randomUUID();
    const unlock = await bearer(userA.access)(api().post(`/episodes/${ep[1]}/unlock`))
      .send({ idempotencyKey: key })
      .expect(200);
    expect(unlock.body).toMatchObject({
      episodeId: ep[1],
      method: 'coins',
      charged: { bonus: 5, purchased: 15 },
    });
    expect(unlock.body.wallet).toMatchObject({
      purchased: 35,
      bonus: 0,
      total: 35,
      bonusExpiring: [],
    });

    const replay = await bearer(userA.access)(api().post(`/episodes/${ep[1]}/unlock`))
      .send({ idempotencyKey: key })
      .expect(200);
    expect(replay.body).toMatchObject({ method: 'coins', charged: { bonus: 0, purchased: 0 } });
    expect(replay.body.wallet.total).toBe(35);

    const free = await bearer(userA.access)(api().post(`/episodes/${ep[0]}/unlock`))
      .send({ idempotencyKey: randomUUID() })
      .expect(200);
    expect(free.body).toMatchObject({ method: 'free', charged: { bonus: 0, purchased: 0 } });

    const list = await bearer(userA.access)(api().get(`/series/${seriesId}/unlocks`)).expect(200);
    expect(list.body.unlockedEpisodeIds).toEqual([ep[1]]);
    expect(
      await prisma.coinLedgerEntry.count({ where: { userId: userA.id, type: 'UNLOCK' } }),
    ).toBe(2);
    await ledgerEqualsWallet(userA.id);

    const episodes = await bearer(userA.access)(api().get(`/series/${seriesId}/episodes`)).expect(
      200,
    );
    expect(episodes.body.map((e: { access: string }) => e.access)).toEqual([
      'free',
      'unlocked',
      'locked',
      'locked',
    ]);
  });

  it('/play auto-unlocks when autoUnlock is on, otherwise answers EPISODE_LOCKED with balance; 402 when insufficient', async () => {
    const locked = await bearer(userA.access)(api().post(`/episodes/${ep[2]}/play`)).expect(403);
    expect(locked.body.code).toBe('EPISODE_LOCKED');
    expect(locked.body.details).toMatchObject({ coinCost: 20, balance: 35, canAutoUnlock: true });

    const me = await bearer(userA.access)(api().patch('/me'))
      .send({ autoUnlock: true })
      .expect(200);
    expect(me.body.autoUnlock).toBe(true);
    const play = await bearer(userA.access)(api().post(`/episodes/${ep[2]}/play`)).expect(200);
    expect(play.body).toMatchObject({ access: 'unlocked', unlocked: true, episodeNumber: 3 });
    const replay = await bearer(userA.access)(api().post(`/episodes/${ep[2]}/play`)).expect(200);
    expect(replay.body.unlocked).toBe(false);
    expect((await bearer(userA.access)(api().get('/wallet')).expect(200)).body).toMatchObject({
      total: 15,
      autoUnlock: true,
    });

    const insufficient = await bearer(userA.access)(api().post(`/episodes/${ep[3]}/unlock`))
      .send({ idempotencyKey: randomUUID() })
      .expect(402);
    expect(insufficient.body.code).toBe('INSUFFICIENT_COINS');
    expect(insufficient.body.details).toEqual({ cost: 20, balance: 15 });
    const stillLocked = await bearer(userA.access)(api().post(`/episodes/${ep[3]}/play`)).expect(
      403,
    );
    expect(stillLocked.body.details).toMatchObject({
      coinCost: 20,
      balance: 15,
      canAutoUnlock: false,
    });
    expect(await prisma.unlock.count({ where: { userId: userA.id } })).toBe(2);
    await ledgerEqualsWallet(userA.id);
  });

  it('DEF-003: PUT /progress is refused on a locked episode and accepted on an unlocked one', async () => {
    const refused = await bearer(userA.access)(api().put('/progress'))
      .send({ episodeId: ep[3], positionSeconds: 5 })
      .expect(403);
    expect(refused.body.code).toBe('EPISODE_LOCKED');
    await bearer(userA.access)(api().put('/progress'))
      .send({ episodeId: ep[1], positionSeconds: 5 })
      .expect(200);
  });

  it('GET /wallet/transactions lists the ledger with filters', async () => {
    const all = await bearer(userA.access)(api().get('/wallet/transactions?pageSize=50')).expect(
      200,
    );
    expect(all.body.total).toBe(5);
    expect(all.body.items[0]).toMatchObject({
      id: expect.any(String),
      amount: expect.any(Number),
      bucket: expect.any(String),
      type: expect.any(String),
      createdAt: expect.any(String),
    });
    const unlocks = await bearer(userA.access)(
      api().get('/wallet/transactions?type=UNLOCK'),
    ).expect(200);
    expect(unlocks.body.items).toHaveLength(3);
    expect(
      unlocks.body.items.every(
        (i: { reference: { type: string } }) => i.reference.type === 'unlock',
      ),
    ).toBe(true);
  });

  // ------------------------------------------------------------ back-office : utilisateurs (B-09)

  it('admin searches users, reads the aggregate, adjusts coins with a reason (audited) and blocks / unblocks', async () => {
    const search = await asAdmin(api().get(`/admin/users?q=${userA.id}`)).expect(200);
    expect(search.body.total).toBe(1);
    expect(search.body.items[0]).toMatchObject({
      id: userA.id,
      balance: { purchased: 15, bonus: 0, total: 15 },
    });

    await asAdmin(api().post(`/admin/users/${userA.id}/coins`))
      .send({ amount: 5, bucket: 'PURCHASED' })
      .expect(400);
    const adjusted = await asAdmin(api().post(`/admin/users/${userA.id}/coins`))
      .send({ amount: 5, bucket: 'PURCHASED', reason: 'Geste commercial e2e' })
      .expect(200);
    expect(adjusted.body).toMatchObject({ purchased: 20, bonus: 0, total: 20 });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'wallet.adjust', targetId: userA.id },
    });
    expect(audit?.oldValue).toMatchObject({ total: 15 });
    expect(audit?.newValue).toMatchObject({ total: 20, amount: 5, reason: 'Geste commercial e2e' });
    await ledgerEqualsWallet(userA.id);

    const detail = await asAdmin(api().get(`/admin/users/${userA.id}`)).expect(200);
    expect(detail.body.user.id).toBe(userA.id);
    expect(detail.body.wallet.total).toBe(20);
    expect(detail.body.unlocks).toHaveLength(2);
    expect(detail.body.unlocks[0]).toMatchObject({
      seriesId,
      method: 'coins',
      episodeNumber: expect.any(Number),
    });
    expect(detail.body.purchases[0]).toMatchObject({ productId: packSku, status: 'ACKNOWLEDGED' });
    expect(detail.body.recentLedger[0].type).toBe('ADJUSTMENT');
    expect(detail.body.subscription.status).toBe('none');

    const blocked = await asAdmin(api().post(`/admin/users/${userB.id}/block`))
      .send({ reason: 'Test e2e' })
      .expect(200);
    expect(blocked.body.status).toBe('BLOCKED');
    await api().post('/auth/refresh').send({ refreshToken: userB.refresh }).expect(401);
    await bearer(userB.access)(api().post(`/episodes/${ep[1]}/unlock`))
      .send({ idempotencyKey: randomUUID() })
      .expect(403);
    const unblocked = await asAdmin(api().post(`/admin/users/${userB.id}/unblock`))
      .send({ reason: 'Test e2e' })
      .expect(200);
    expect(unblocked.body.status).toBe('ACTIVE');
    await asAdmin(api().post(`/admin/users/${userB.id}/unblock`))
      .send({ reason: 'Test e2e' })
      .expect(409);
  });

  // ------------------------------------------------------------ abonnement VIP et RTDN (S07-BE-07)

  it('a fake subscription activates the VIP, /play records a vip unlock, RTDN voiding ends it', async () => {
    userC = await guest();
    const none = await bearer(userC.access)(api().get('/me/subscription')).expect(200);
    expect(none.body.status).toBe('none');

    const token = `fake:${planSku}:${suffix}`;
    const verify = await bearer(userC.access)(api().post('/billing/google/verify'))
      .send({
        purchaseToken: token,
        productId: planSku,
        type: 'subs',
        idempotencyKey: randomUUID(),
      })
      .expect(200);
    expect(verify.body.status).toBe('subscription_active');
    expect(verify.body.vip).toMatchObject({
      status: 'active',
      autoRenew: true,
      store: 'google',
      plan: { sku: planSku },
    });
    const meVip = await bearer(userC.access)(api().get('/me')).expect(200);
    expect(meVip.body.vipStatus).toBe('active');

    const play = await bearer(userC.access)(api().post(`/episodes/${ep[3]}/play`)).expect(200);
    expect(play.body).toMatchObject({ access: 'unlocked', unlocked: false });
    const vipUnlock = await prisma.unlock.findUnique({
      where: { userId_episodeId: { userId: userC.id, episodeId: ep[3] } },
    });
    expect(vipUnlock?.method).toBe('VIP');
    const unlockCall = await bearer(userC.access)(api().post(`/episodes/${ep[2]}/unlock`))
      .send({ idempotencyKey: randomUUID() })
      .expect(200);
    expect(unlockCall.body).toMatchObject({ method: 'vip', charged: { bonus: 0, purchased: 0 } });

    await api()
      .post('/webhooks/google-rtdn')
      .send({
        message: {
          data: encode({ voidedPurchaseNotification: { purchaseToken: token, productType: 1 } }),
          messageId: '1',
        },
      })
      .expect(204);
    const ended = await bearer(userC.access)(api().get('/me/subscription')).expect(200);
    expect(ended.body.status).toBe('expired');
    // Les déblocages VIP acquis restent ; un nouvel épisode est verrouillé.
    await bearer(userC.access)(api().post(`/episodes/${ep[1]}/play`)).expect(403);
  });

  it('RTDN refund of a pack writes negative REFUND rows; a negative balance blocks unlocks', async () => {
    await api()
      .post('/webhooks/google-rtdn')
      .send({
        message: {
          data: encode({ voidedPurchaseNotification: { purchaseToken, productType: 2 } }),
          messageId: '2',
        },
      })
      .expect(204);
    const wallet = await bearer(userA.access)(api().get('/wallet')).expect(200);
    expect(wallet.body.total).toBe(20 - 55);
    expect(wallet.body.purchased).toBe(-30);
    expect((await prisma.purchase.findUniqueOrThrow({ where: { purchaseToken } })).status).toBe(
      'REFUNDED',
    );
    await asAdmin(api().post(`/admin/users/${userA.id}/coins`))
      .send({ amount: 100, bucket: 'PURCHASED', reason: 'Rattrapage' })
      .expect(200);
    // Bonus négatif (-5) : tout déblocage reste bloqué malgré un total positif.
    const blocked = await bearer(userA.access)(api().post(`/episodes/${ep[3]}/unlock`))
      .send({ idempotencyKey: randomUUID() })
      .expect(402);
    expect(blocked.body.details.cost).toBe(20);
    await ledgerEqualsWallet(userA.id);
    // Rejeu du remboursement : aucune nouvelle ligne.
    const before = await prisma.coinLedgerEntry.count({ where: { userId: userA.id } });
    await api()
      .post('/webhooks/google-rtdn')
      .send({
        message: {
          data: encode({ voidedPurchaseNotification: { purchaseToken, productType: 2 } }),
          messageId: '3',
        },
      })
      .expect(204);
    expect(await prisma.coinLedgerEntry.count({ where: { userId: userA.id } })).toBe(before);
  });

  // ------------------------------------------------------------ défauts de recette

  it('DEF-002: search by genre alone works, no criteria at all is rejected', async () => {
    const byGenre = await api().get(`/search?genre=e2e-genre-${suffix}`).expect(200);
    expect(byGenre.body.items.map((s: { id: string }) => s.id)).toEqual([seriesId]);
    expect(byGenre.body.suggestions).toEqual([]);
    const none = await api().get('/search').expect(400);
    expect(none.body.code).toBe('VALIDATION_ERROR');
  });

  it('DEF-004: /play applies the territory filter like the catalogue', async () => {
    await bearer(userA.access)(api().post(`/episodes/${restrictedEpisode}/play`))
      .set('X-Country', 'TG')
      .expect(404);
    await bearer(userA.access)(api().post(`/episodes/${restrictedEpisode}/play`))
      .set('X-Country', 'AQ')
      .expect(200);
    await bearer(userA.access)(api().put('/progress'))
      .set('X-Country', 'TG')
      .send({ episodeId: restrictedEpisode, positionSeconds: 1 })
      .expect(404);
  });

  it('DEF-008 / DEF-009: cursor, X-Country and malformed ids answer 400 VALIDATION_ERROR', async () => {
    const cursor = await api().get('/feed?cursor=garbage').expect(400);
    expect(cursor.body.code).toBe('VALIDATION_ERROR');
    const cursor2 = await api()
      .get(`/feed?cursor=${Buffer.from('abc').toString('base64url')}`)
      .expect(400);
    expect(cursor2.body.code).toBe('VALIDATION_ERROR');
    await api()
      .get(`/feed?cursor=${Buffer.from('0').toString('base64url')}`)
      .expect(200);
    const country = await api().get('/home').set('X-Country', 'ZZZZ').expect(400);
    expect(country.body.code).toBe('VALIDATION_ERROR');
    await api().get('/home').set('X-Country', 'tg').expect(200);
    const favorite = await bearer(userA.access)(api().put('/me/favorites/abc')).expect(400);
    expect(favorite.body.code).toBe('VALIDATION_ERROR');
    const admin = await asAdmin(api().get('/admin/users/abc')).expect(400);
    expect(admin.body.code).toBe('VALIDATION_ERROR');
  });

  it('cleans up the throwaway pack and plan through the admin API', async () => {
    await asAdmin(api().delete(`/admin/monetization/packs/${packIds[0]}`)).expect(204);
    await asAdmin(api().delete(`/admin/monetization/vip-plans/${planIds[0]}`)).expect(204);
    await asAdmin(api().delete(`/admin/monetization/packs/${packIds[0]}`)).expect(404);
  });
});
