/**
 * Sprint 7 de bout en bout (contrat v1.5) : check-in quotidien, tâches récompensées, pub récompensée
 * (session + callback SSV simulé), déblocage de série entière, code promo, recharge mobile money
 * (commande → page simulée → webhook → portefeuille crédité une seule fois), classements, genres.
 */
import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { buildSsvQuery } from '../src/ads/ssv/ad-ssv-verifier.js';
import { signFakeSsv } from '../src/ads/ssv/fake-ad-ssv.verifier.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfig } from '../src/config/app-config.js';
import { FAKE_SIGNATURE_HEADER } from '../src/topup/provider/fake-mobile-money.provider.js';
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
process.env.AD_PROVIDER = 'fake';
process.env.MOBILE_MONEY_PROVIDER = 'fake';
process.env.TOPUP_PUBLIC_BASE_URL ??= 'http://localhost:3000';
delete process.env.GOOGLE_RTDN_AUTH_TOKEN;

const suffix = `s7${Date.now().toString(36)}`;

describe('Sprint 7 API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let config: AppConfig;
  const userIds: string[] = [];
  const seriesIds: string[] = [];
  const promoIds: string[] = [];
  const ep: string[] = [];
  let seriesId = '';

  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function guest() {
    const res = await api()
      .post('/auth/guest')
      .send({ deviceId: `e2e-${suffix}-${Math.random().toString(36).slice(2, 10)}`, country: 'TG' })
      .expect(201);
    userIds.push(res.body.user.id as string);
    return { id: res.body.user.id as string, access: res.body.tokens.accessToken as string };
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
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    config = app.get(AppConfig);
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const rlKeys = await redis.client.keys('rl:*');
    if (rlKeys.length > 0) await redis.client.del(...rlKeys);

    const publishedAt = new Date(Date.now() - 86_400_000);
    const series = await prisma.series.create({
      data: {
        slug: `e2e-s7-${suffix}`,
        title: `E2E Récompenses ${suffix}`,
        synopsis: 'Série de test sprint 7',
        genres: ['drame'],
        status: 'PUBLISHED',
        freeEpisodeCount: 1,
        coinCostPerEpisode: 10,
        adUnlockEnabled: true,
        publishedAt,
        episodes: {
          create: [1, 2, 3].map((n) => ({
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
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.coinLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.purchase.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.topupOrder.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.promoRedemption.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.checkinClaim.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.rewardTaskClaim.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.adSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (promoIds.length > 0) await prisma.promoCode.deleteMany({ where: { id: { in: promoIds } } });
    if (seriesIds.length > 0) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    await app.close();
  });

  // ------------------------------------------------------------ check-in (M-40, S08-BE-04)

  it('check-in credits bonus coins once a day and 409s on a second claim', async () => {
    const u = await guest();
    const status = await bearer(u.access)(api().get('/rewards/checkin')).expect(200);
    expect(status.body).toMatchObject({ claimedToday: false, streakDay: 0 });
    expect(status.body.scale).toHaveLength(7);

    const claim = await bearer(u.access)(api().post('/rewards/checkin'))
      .send({ idempotencyKey: `k-${suffix}-1` })
      .expect(200);
    expect(claim.body).toMatchObject({ day: 1 });
    expect(claim.body.wallet.bonus).toBe(claim.body.coins);

    const again = await bearer(u.access)(api().post('/rewards/checkin'))
      .send({ idempotencyKey: `k-${suffix}-2` })
      .expect(409);
    expect(again.body.code).toBe('CHECKIN_ALREADY_CLAIMED');
    expect(again.body.details.nextClaimAt).toBeTruthy();

    // Rejeu avec la même clé : même résultat, aucun second crédit.
    const replay = await bearer(u.access)(api().post('/rewards/checkin'))
      .send({ idempotencyKey: `k-${suffix}-1` })
      .expect(200);
    expect(replay.body).toMatchObject({ day: 1, coins: claim.body.coins });
    await ledgerEqualsWallet(u.id);
  });

  // ------------------------------------------------------------ tâches (M-41)

  it('a reward task becomes claimable once the server-side signal is met, then claims once', async () => {
    const u = await guest();
    await prisma.favorite.create({ data: { userId: u.id, seriesId } });

    const tasks = await bearer(u.access)(api().get('/rewards/tasks')).expect(200);
    const favoriteTask = tasks.body.tasks.find((t: { key: string }) => t.key === 'add_favorite');
    expect(favoriteTask).toMatchObject({ status: 'CLAIMABLE', progress: 1, target: 1 });

    const claim = await bearer(u.access)(api().post('/rewards/tasks/add_favorite/claim'))
      .send({ idempotencyKey: `tk-${suffix}-1` })
      .expect(200);
    expect(claim.body.coins).toBeGreaterThan(0);

    const conflict = await bearer(u.access)(api().post('/rewards/tasks/add_favorite/claim'))
      .send({ idempotencyKey: `tk-${suffix}-2` })
      .expect(409);
    expect(conflict.body.code).toBe('TASK_NOT_CLAIMABLE');
    await ledgerEqualsWallet(u.id);
  });

  // ------------------------------------------------------------ pub récompensée (M-22, S08-BE-03)

  it('a rewarded ad session is unlocked only by a validly signed SSV callback, idempotent, cap enforced', async () => {
    const u = await guest();
    const episodeId = ep[2]; // épisode 3, hors gratuit (freeEpisodeCount = 1)

    const eligibility = await bearer(u.access)(
      api().get(`/ads/eligibility?episodeId=${episodeId}`),
    ).expect(200);
    expect(eligibility.body).toMatchObject({ eligible: true, provider: 'fake' });

    const session = await bearer(u.access)(api().post('/ads/sessions'))
      .send({ episodeId })
      .expect(201);
    const { sessionId, customData } = session.body;

    const secret = config.ads.fakeSecret;
    const callback = (txId: string) => {
      const content = buildSsvQuery({
        ad_network: '0',
        ad_unit: 'fake',
        custom_data: customData,
        reward_amount: 1,
        reward_item: 'episode',
        timestamp: String(Date.now()),
        transaction_id: txId,
        user_id: u.id,
      });
      const signature = signFakeSsv(secret, content);
      return api().get(`/ads/reward?${content}&signature=${encodeURIComponent(signature)}`);
    };

    const reward = await callback(`tx-${suffix}-1`).expect(200);
    expect(reward.body).toMatchObject({ accepted: true, episodeId });

    const polled = await bearer(u.access)(api().get(`/ads/sessions/${sessionId}`)).expect(200);
    expect(polled.body).toMatchObject({ status: 'REWARDED', unlocked: true });

    // Idempotent par transaction_id : un rejeu ne crée pas de second déblocage ni d'erreur.
    const replay = await callback(`tx-${suffix}-1`).expect(200);
    expect(replay.body).toMatchObject({ accepted: true, episodeId });

    const unlocks = await prisma.unlock.findMany({ where: { userId: u.id, episodeId } });
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0].method).toBe('AD');

    // Une signature invalide est refusée.
    const bad = await api().get(
      `/ads/reward?${buildSsvQuery({ transaction_id: 'tx-bad', user_id: u.id, custom_data: customData })}&signature=deadbeef`,
    );
    expect(bad.status).toBe(401);

    // Plafond quotidien : au-delà de adDailyCap, l'éligibilité refuse une nouvelle session.
    const settings = await prisma.monetizationSettings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    for (let i = 0; i < settings.adDailyCap; i++) {
      await redis.client.incr(`ads:cap:${u.id}:${new Date().toISOString().slice(0, 10)}`);
    }
    const capped = await bearer(u.access)(api().get(`/ads/eligibility?episodeId=${ep[1]}`)).expect(
      200,
    );
    expect(capped.body).toMatchObject({
      eligible: false,
      reason: 'CAP_REACHED',
      remainingToday: 0,
    });
  });

  // ------------------------------------------------------------ déblocage de série entière (M-23)

  it('unlock-all charges the discounted sum once and is idempotent', async () => {
    const u = await guest();
    const pack = await prisma.coinPack.findFirst({
      where: { isActive: true, coins: { gte: 20 } },
      orderBy: { coins: 'desc' },
    });
    expect(pack).toBeTruthy();
    // Crédite des pièces par le chemin réel (WalletService seul écrivain du grand livre).
    await bearer(u.access)(api().post('/billing/google/verify'))
      .send({
        type: 'inapp',
        productId: pack!.sku,
        purchaseToken: `fake:${pack!.sku}:${suffix}-ua`,
        idempotencyKey: `bv-${suffix}-ua`,
      })
      .expect(200);

    const quote = await bearer(u.access)(api().get(`/series/${seriesId}/unlock-all/quote`)).expect(
      200,
    );
    expect(quote.body.lockedCount).toBe(2); // épisodes 2 et 3 (épisode 1 gratuit)
    expect(quote.body.price).toBe(quote.body.fullPrice);

    const result = await bearer(u.access)(api().post(`/series/${seriesId}/unlock-all`))
      .send({ idempotencyKey: `ua-${suffix}` })
      .expect(200);
    expect(result.body.unlockedEpisodeIds).toHaveLength(2);
    expect(result.body.charged.purchased + result.body.charged.bonus).toBe(quote.body.price);

    const replay = await bearer(u.access)(api().post(`/series/${seriesId}/unlock-all`))
      .send({ idempotencyKey: `ua-${suffix}` })
      .expect(200);
    expect(replay.body.unlockedEpisodeIds.sort()).toEqual(result.body.unlockedEpisodeIds.sort());
    expect(replay.body.charged).toEqual(result.body.charged);
    await ledgerEqualsWallet(u.id);
  });

  // ------------------------------------------------------------ codes promo (M-24)

  it('redeeming a promo code twice only credits once', async () => {
    const u = await guest();
    const promo = await prisma.promoCode.create({
      data: { code: `E2E${suffix.toUpperCase()}`, coins: 25, perUserUses: 1 },
    });
    promoIds.push(promo.id);

    const first = await bearer(u.access)(api().post('/promo/redeem'))
      .send({ code: promo.code.toLowerCase(), idempotencyKey: `p-${suffix}-1` })
      .expect(200);
    expect(first.body.coins).toBe(25);

    const second = await bearer(u.access)(api().post('/promo/redeem'))
      .send({ code: promo.code, idempotencyKey: `p-${suffix}-2` })
      .expect(409);
    expect(second.body.code).toBe('PROMO_ALREADY_USED');

    const unknown = await bearer(u.access)(api().post('/promo/redeem'))
      .send({ code: 'DOES-NOT-EXIST', idempotencyKey: `p-${suffix}-3` })
      .expect(404);
    expect(unknown.body.code).toBe('PROMO_INVALID');
    await ledgerEqualsWallet(u.id);
  });

  // ------------------------------------------------------------ recharge mobile money (S09-BE-01/02)

  it('a top-up order is credited exactly once through the fake payment page and webhook', async () => {
    const u = await guest();
    const pack = await prisma.coinPack.findFirst({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });
    expect(pack).toBeTruthy();

    const order = await bearer(u.access)(api().post('/topup/orders'))
      .send({ packSku: pack!.sku, country: 'TG', idempotencyKey: `t-${suffix}` })
      .expect(201);
    expect(order.body.paymentUrl).toContain(`/topup/fake/${order.body.orderId}`);

    const page = await api().get(`/topup/fake/${order.body.orderId}`).expect(200);
    expect(page.text).toContain('Payer');

    const paid = await api().post(`/topup/fake/${order.body.orderId}`).send({ outcome: 'paid' });
    expect([200, 303]).toContain(paid.status);

    const status = await bearer(u.access)(api().get(`/topup/orders/${order.body.orderId}`)).expect(
      200,
    );
    expect(status.body.status).toBe('PAID');
    expect(status.body.creditedAt).toBeTruthy();

    // Rejouer le webhook (même référence) ne crédite pas une seconde fois.
    const raw = {
      orderId: order.body.orderId,
      reference: `fake:${order.body.orderId}:paid`,
      status: 'paid',
    };
    const rawBody = JSON.stringify(raw);
    const { createHmac } = await import('node:crypto');
    const signature = `sha256=${createHmac('sha256', config.topup.fakeSecret).update(rawBody).digest('hex')}`;
    await api()
      .post('/webhooks/mobile-money/fake')
      .set('Content-Type', 'application/json')
      .set(FAKE_SIGNATURE_HEADER, signature)
      .send(raw)
      .expect(200);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: u.id } });
    expect(wallet.purchasedBalance).toBe(pack!.coins);
    await ledgerEqualsWallet(u.id);

    const list = await bearer(u.access)(api().get('/topup/orders')).expect(200);
    expect(list.body.items[0].orderId).toBe(order.body.orderId);
  });

  // ------------------------------------------------------------ classements et genres (M-04, DEF-012)

  it('rankings order series by distinct viewers and genres are localized', async () => {
    const u = await guest();
    await prisma.watchProgress.create({
      data: { userId: u.id, episodeId: ep[0], positionSeconds: 60, completed: true },
    });
    // Le classement est caché 10 min (partagé avec l'API de dev) : purger avant de lire.
    const rankingKeys = await redis.client.keys('cache:v1:rankings:*');
    if (rankingKeys.length > 0) await redis.client.del(...rankingKeys);

    const rankings = await api().get('/rankings?period=all').expect(200);
    const found = rankings.body.items.find(
      (i: { series: { id: string } }) => i.series.id === seriesId,
    );
    expect(found).toBeTruthy();
    expect(found.viewers).toBeGreaterThanOrEqual(1);

    const genresFr = await api().get('/genres?lang=fr').expect(200);
    expect(genresFr.body.items.find((g: { key: string }) => g.key === 'drame')).toMatchObject({
      label: 'Drame',
    });
    const genresEn = await api().get('/genres?lang=en').expect(200);
    expect(genresEn.body.items.find((g: { key: string }) => g.key === 'drame')).toMatchObject({
      label: 'Drama',
    });
  });
});
