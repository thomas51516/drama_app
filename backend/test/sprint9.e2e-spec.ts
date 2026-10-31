/**
 * Sprint 9 de bout en bout : droits et contrats (B-12, statut dérivé NONE|ACTIVE|EXPIRED, publication
 * non bloquée + avertissement d'audit, liste de rappel), et compléments du tableau de bord (B-11)
 * revenus par source, rétention par épisode, conversion au paywall.
 * Les agrégats partagés avec l'environnement de dev (revenus, conversion, unlocks) ne sont vérifiés
 * qu'en borne basse ; la rétention et les droits utilisent une série dédiée, donc en valeur exacte.
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
import { statsCacheKey } from '../src/admin/stats/admin-stats.service.js';
import { AppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';

process.env.TRANSCODE_PROVIDER = 'webhook';
process.env.TRANSCODE_WORKER_ENABLED = 'false';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SMS_PROVIDER = 'console';
process.env.MEDIA_SIGNER = 'plain';
process.env.PUSH_PROVIDER = 'log';
process.env.PUSH_QUEUE_ENABLED = 'false';
process.env.BILLING_VERIFIER = 'fake';
process.env.AD_PROVIDER = 'fake';
process.env.MOBILE_MONEY_PROVIDER = 'fake';
process.env.TOPUP_PUBLIC_BASE_URL ??= 'http://localhost:3000';

const PASSWORD = 'E2e-Password!2026';
const suffix = `s9${Date.now().toString(36)}`;

describe('Sprint 9 API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const adminIds: string[] = [];
  const seriesIds: string[] = [];
  const userIds: string[] = [];
  let adminToken = '';
  let editorToken = '';
  let retentionSeriesId = '';
  const retentionEpisodes: string[] = [];
  let draftSeriesId = '';
  let conversionEpisodeId = '';
  const promoIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const asEditor = (r: request.Test) => r.set('Authorization', `Bearer ${editorToken}`);
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function guest() {
    const res = await api()
      .post('/auth/guest')
      .send({ deviceId: `e2e-${suffix}-${Math.random().toString(36).slice(2, 10)}`, country: 'TG' })
      .expect(201);
    userIds.push(res.body.user.id as string);
    return { id: res.body.user.id as string, access: res.body.tokens.accessToken as string };
  }

  async function loginAdmin(email: string): Promise<string> {
    const login = await api()
      .post('/admin/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const verify = await api()
      .post('/admin/auth/totp/verify')
      .send({
        challengeToken: login.body.challengeToken,
        code: totpCode(login.body.secret as string),
      })
      .expect(200);
    return verify.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    configureApp(app, app.get(AppConfig));
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    const admin = await prisma.adminAccount.create({
      data: {
        email: `e2e-admin-${suffix}@drama.local`,
        displayName: 'E2E ADMIN S9',
        role: 'ADMIN',
        passwordHash,
      },
    });
    const editor = await prisma.adminAccount.create({
      data: {
        email: `e2e-editor-${suffix}@drama.local`,
        displayName: 'E2E EDITOR S9',
        role: 'EDITOR',
        passwordHash,
      },
    });
    adminIds.push(admin.id, editor.id);
    adminToken = await loginAdmin(admin.email);
    editorToken = await loginAdmin(editor.email);

    const publishedAt = new Date(Date.now() - 86_400_000);
    const retentionSeries = await prisma.series.create({
      data: {
        slug: `e2e-s9-retention-${suffix}`,
        title: `E2E Rétention ${suffix}`,
        synopsis: 'Série de test sprint 9 (rétention)',
        status: 'PUBLISHED',
        freeEpisodeCount: 3,
        publishedAt,
        episodes: {
          create: [1, 2, 3].map((n) => ({
            number: n,
            title: `Épisode ${n}`,
            durationSeconds: 60,
            transcodeStatus: 'READY',
            hlsKey: `hls/e2e/${suffix}/ret/${n}/master.m3u8`,
            publishedAt,
          })),
        },
      },
      include: { episodes: { orderBy: { number: 'asc' } } },
    });
    retentionSeriesId = retentionSeries.id;
    seriesIds.push(retentionSeries.id);
    retentionEpisodes.push(...retentionSeries.episodes.map((e) => e.id));

    const draft = await prisma.series.create({
      data: {
        slug: `e2e-s9-draft-${suffix}`,
        title: `E2E Sans Contrat ${suffix}`,
        synopsis: 'Série de test sprint 9 (droits)',
        status: 'DRAFT',
        episodes: {
          create: [
            {
              number: 1,
              title: 'Épisode 1',
              durationSeconds: 60,
              transcodeStatus: 'READY',
              hlsKey: `hls/e2e/${suffix}/draft/1/master.m3u8`,
            },
          ],
        },
      },
      include: { episodes: true },
    });
    draftSeriesId = draft.id;
    seriesIds.push(draft.id);

    // Série dédiée à la conversion au paywall : épisode payant (pas d'accès gratuit), pour qu'un
    // déblocage (table `unlocks`) soit réellement créé après la vue du paywall.
    const conversionSeries = await prisma.series.create({
      data: {
        slug: `e2e-s9-conversion-${suffix}`,
        title: `E2E Conversion ${suffix}`,
        synopsis: 'Série de test sprint 9 (conversion)',
        status: 'PUBLISHED',
        freeEpisodeCount: 0,
        coinCostPerEpisode: 5,
        publishedAt,
        episodes: {
          create: [
            {
              number: 1,
              title: 'Épisode 1',
              durationSeconds: 60,
              transcodeStatus: 'READY',
              hlsKey: `hls/e2e/${suffix}/conv/1/master.m3u8`,
              publishedAt,
            },
          ],
        },
      },
      include: { episodes: true },
    });
    conversionEpisodeId = conversionSeries.episodes[0].id;
    seriesIds.push(conversionSeries.id);
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.coinLedgerEntry.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.purchase.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.topupOrder.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (seriesIds.length > 0) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    if (promoIds.length > 0) await prisma.promoCode.deleteMany({ where: { id: { in: promoIds } } });
    if (adminIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: adminIds } } });
      await prisma.adminAccount.deleteMany({ where: { id: { in: adminIds } } });
    }
    await app.close();
  });

  // ------------------------------------------------------------ droits et contrats (B-12)

  it('derives NONE, then ACTIVE, then EXPIRED, and enforces MONETIZATION/ADMIN-only writes', async () => {
    const before = await asAdmin(api().get(`/admin/series/${draftSeriesId}`)).expect(200);
    expect(before.body.rightsStatus).toBe('NONE');
    expect(before.body.rightsContract).toBeNull();

    await asAdmin(api().get(`/admin/series/${draftSeriesId}/rights-contract`))
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('RIGHTS_CONTRACT_NOT_FOUND'));

    // EDITOR peut lire mais pas écrire (contrat admin v1.6).
    await asEditor(api().get(`/admin/series/${draftSeriesId}/rights-contract`)).expect(404);
    await asEditor(api().post(`/admin/series/${draftSeriesId}/rights-contract`))
      .send({ rightsHolder: 'X', licenseStartsAt: new Date().toISOString() })
      .expect(403);

    const start = new Date(Date.now() - 86_400_000).toISOString();
    const created = await asAdmin(api().post(`/admin/series/${draftSeriesId}/rights-contract`))
      .send({ rightsHolder: 'E2E Rights Holder', licenseStartsAt: start })
      .expect(201);
    expect(created.body).toMatchObject({
      seriesId: draftSeriesId,
      rightsHolder: 'E2E Rights Holder',
      territories: [],
      licenseEndsAt: null,
    });

    await asAdmin(api().post(`/admin/series/${draftSeriesId}/rights-contract`))
      .send({ rightsHolder: 'Y', licenseStartsAt: start })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('RIGHTS_CONTRACT_ALREADY_EXISTS'));

    const active = await asAdmin(api().get(`/admin/series/${draftSeriesId}`)).expect(200);
    expect(active.body.rightsStatus).toBe('ACTIVE');
    expect(active.body.rightsContract.rightsHolder).toBe('E2E Rights Holder');

    const yesterday = new Date(Date.now() - 3600_000).toISOString();
    await asAdmin(api().patch(`/admin/series/${draftSeriesId}/rights-contract`))
      .send({ licenseEndsAt: yesterday })
      .expect(200);

    const expired = await asAdmin(api().get(`/admin/series/${draftSeriesId}`)).expect(200);
    expect(expired.body.rightsStatus).toBe('EXPIRED');

    const list = await asAdmin(api().get('/admin/rights-contracts?expiringWithinDays=5')).expect(
      200,
    );
    const row = list.body.items.find((i: { seriesId: string }) => i.seriesId === draftSeriesId);
    expect(row).toMatchObject({ rightsStatus: 'EXPIRED' });

    const auditRows = await prisma.auditLog.findMany({
      where: { targetType: 'rights_contract', targetId: created.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditRows.map((r) => r.action)).toEqual([
      'rights_contract.create',
      'rights_contract.update',
    ]);

    await asEditor(api().delete(`/admin/series/${draftSeriesId}/rights-contract`)).expect(403);
    await asAdmin(api().delete(`/admin/series/${draftSeriesId}/rights-contract`)).expect(204);
    await asAdmin(api().get(`/admin/series/${draftSeriesId}/rights-contract`)).expect(404);
    const afterDelete = await asAdmin(api().get(`/admin/series/${draftSeriesId}`)).expect(200);
    expect(afterDelete.body.rightsStatus).toBe('NONE');
  });

  it('publishes without a contract (not blocked) and logs an audit warning, not an error', async () => {
    const published = await asAdmin(api().post(`/admin/series/${draftSeriesId}/publish`)).expect(
      200,
    );
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.rightsStatus).toBe('NONE');

    const warnings = await prisma.auditLog.findMany({
      where: {
        targetType: 'series',
        targetId: draftSeriesId,
        action: 'series.publish_rights_warning',
      },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].newValue).toEqual({ rightsStatus: 'NONE' });

    // Idempotent : la liste de rappel voit toujours la série sans contrat.
    const list = await asAdmin(api().get('/admin/rights-contracts')).expect(200);
    const row = list.body.items.find((i: { seriesId: string }) => i.seriesId === draftSeriesId);
    expect(row).toMatchObject({ rightsStatus: 'NONE', seriesStatus: 'PUBLISHED' });
  });

  // ------------------------------------------------------------ tableau de bord (B-11)

  it('computes the retention curve from watch_progress for a given series', async () => {
    const [u1, u2] = await Promise.all([guest(), guest()]);
    for (const ep of retentionEpisodes) {
      await bearer(u1.access)(api().put('/progress'))
        .send({ episodeId: ep, positionSeconds: 5 })
        .expect(200);
    }
    await bearer(u2.access)(api().put('/progress'))
      .send({ episodeId: retentionEpisodes[0], positionSeconds: 5 })
      .expect(200);

    const retention = await asAdmin(
      api().get(`/admin/stats/retention?seriesId=${retentionSeriesId}`),
    ).expect(200);
    expect(retention.body.seriesId).toBe(retentionSeriesId);
    expect(retention.body.cohortSize).toBe(2);
    expect(retention.body.points).toEqual([
      { episodeNumber: 1, viewers: 2, retentionPercent: 100 },
      { episodeNumber: 2, viewers: 1, retentionPercent: 50 },
      { episodeNumber: 3, viewers: 1, retentionPercent: 50 },
    ]);
  });

  it('404s on retention for an unknown series', async () => {
    await asAdmin(api().get(`/admin/stats/retention?seriesId=${randomUUID()}`))
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('SERIES_NOT_FOUND'));
  });

  it('overview reports real revenue by source and an approximate paywall conversion (lower bounds, shared dev data)', async () => {
    const u = await guest();
    const pack = await prisma.coinPack.findFirst({
      where: { isActive: true },
      orderBy: { position: 'asc' },
    });
    expect(pack).toBeTruthy();

    const order = await bearer(u.access)(api().post('/topup/orders'))
      .send({ packSku: pack!.sku, country: 'TG', idempotencyKey: `s9-${suffix}` })
      .expect(201);
    await api().post(`/topup/fake/${order.body.orderId}`).send({ outcome: 'paid' });
    const status = await bearer(u.access)(api().get(`/topup/orders/${order.body.orderId}`)).expect(
      200,
    );
    expect(status.body.status).toBe('PAID');
    const orderCurrency = status.body.amount.currency as string;
    const orderAmountMinor = status.body.amount.amountMinor as number;

    // Pièces pour débloquer un épisode payant (déblocage réel = ligne `unlocks`, contrairement à un
    // épisode gratuit qui ne crée aucune ligne — `UnlockService.unlock()` renvoie `method: 'free'`
    // sans persister).
    const promo = await prisma.promoCode.create({
      data: { code: `E2ES9${suffix.toUpperCase()}`, coins: 20, perUserUses: 1 },
    });
    promoIds.push(promo.id);
    await bearer(u.access)(api().post('/promo/redeem'))
      .send({ code: promo.code, idempotencyKey: `s9-promo-${suffix}` })
      .expect(200);

    const now = new Date().toISOString();
    await bearer(u.access)(api().post('/events'))
      .send({
        events: [{ name: 'paywall_view', params: { seriesId: retentionSeriesId }, at: now }],
      })
      .expect(202);
    await bearer(u.access)(api().post(`/episodes/${conversionEpisodeId}/unlock`))
      .send({ idempotencyKey: `s9-unlock-${suffix}` })
      .expect(200);

    await redis.client.del(statsCacheKey(1));
    const overview = await asAdmin(api().get('/admin/stats/overview?days=1')).expect(200);
    await redis.client.del(statsCacheKey(1));

    const mobileMoney = overview.body.revenueBySource.find(
      (r: { source: string; currency: string }) =>
        r.source === 'MOBILE_MONEY' && r.currency === orderCurrency,
    );
    expect(mobileMoney).toBeTruthy();
    expect(mobileMoney.amountMinor).toBeGreaterThanOrEqual(orderAmountMinor);
    expect(mobileMoney.orderCount).toBeGreaterThanOrEqual(1);

    expect(overview.body.paywallConversion.paywallViewers).toBeGreaterThanOrEqual(1);
    expect(overview.body.paywallConversion.convertedViewers).toBeGreaterThanOrEqual(1);
    expect(overview.body.paywallConversion.windowHours).toBe(24);
    expect(overview.body.unlocks).toBeGreaterThanOrEqual(1);
  });
});
