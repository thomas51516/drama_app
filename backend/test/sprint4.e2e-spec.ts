/**
 * Sprint 4 de bout en bout (contrat public v1.2) : OTP (fournisseur console, code lu dans Redis),
 * inscription e-mail avec rattachement de l'invité (progression conservée), fusion de deux comptes
 * (favoris, grand livre), /me (PATCH, suppression différée, annulation, anonymisation), favoris et
 * « J'aime », recherche, lecture signée en mode hmac, publication programmée, tableau de bord v0.
 */
import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { otpDevCodeKey } from '../src/auth/otp/otp.service.js';
import { totpCode } from '../src/common/crypto/totp.js';
import { AppConfig } from '../src/config/app-config.js';
import { PublishSchedulerService } from '../src/jobs/publish-scheduler.service.js';
import { verifyMediaUrl } from '../src/media/hmac-media-url-signer.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { statsCacheKey } from '../src/admin/stats/admin-stats.service.js';
import { AccountDeletionService } from '../src/users/account-deletion.service.js';

process.env.TRANSCODE_PROVIDER = 'webhook';
process.env.TRANSCODE_WORKER_ENABLED = 'false';
process.env.TRANSCODE_WEBHOOK_SECRET ??= 'e2e-transcode-webhook-secret-0123456789';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SMS_PROVIDER = 'console';
process.env.MEDIA_SIGNER = 'plain';

const PASSWORD = 'E2e-Password!2026';
const suffix = `s4${Date.now().toString(36)}`;
const HMAC_KEY = 'e2e-media-signing-key-0123456789abcdef';

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  configureApp(app, app.get(AppConfig));
  await app.init();
  return app;
}

describe('Sprint 4 public + admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const adminEmail = `e2e-admin-${suffix}@drama.local`;
  const adminIds: string[] = [];
  const seriesIds: string[] = [];
  const userIds: string[] = [];
  let adminToken = '';
  let seriesId = '';
  let zoneSeriesId = '';
  let episode1 = '';
  let episode2 = '';

  // Comptes du scénario e-mail : A (inscrit depuis un invité), B (invité fusionné dans A).
  const emailA = `e2e-${suffix}@example.com`;
  let tokensA = { access: '', refresh: '', id: '' };

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function guest(): Promise<{ id: string; access: string; refresh: string }> {
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

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const rlKeys = await redis.client.keys('rl:*');
    if (rlKeys.length > 0) await redis.client.del(...rlKeys);

    const acc = await prisma.adminAccount.create({
      data: {
        email: adminEmail,
        displayName: 'E2E ADMIN S4',
        role: 'ADMIN',
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      },
    });
    adminIds.push(acc.id);
    const login = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    const verify = await api()
      .post('/admin/auth/totp/verify')
      .send({
        challengeToken: login.body.challengeToken,
        code: totpCode(login.body.secret as string),
      })
      .expect(200);
    adminToken = verify.body.accessToken as string;

    // Série publiée : épisode 1 visible, épisode 2 programmé dans une heure.
    const created = await asAdmin(api().post('/admin/series'))
      .send({
        title: `E2E Héritage ${suffix}`,
        synopsis: 'Awa découvre un testament à Lomé.',
        genres: ['e2e-genre'],
        tags: [`lagune-${suffix}`],
        language: 'fr',
      })
      .expect(201);
    seriesId = created.body.id as string;
    seriesIds.push(seriesId);
    for (const [i, title] of [['Pilote'], ['Suite']].entries()) {
      const ep = await asAdmin(api().post(`/admin/series/${seriesId}/episodes`))
        .send({ title: title[0] })
        .expect(201);
      const id = ep.body.id as string;
      if (i === 0) episode1 = id;
      else episode2 = id;
      await prisma.episode.update({
        where: { id },
        data: {
          transcodeStatus: 'READY',
          hlsKey: `hls/${id}/master.m3u8`,
          previewKey: `hls/${id}/preview/index.m3u8`,
          durationSeconds: 60,
          publishedAt: new Date(Date.now() + (i === 0 ? -60_000 : 3_600_000)),
        },
      });
    }
    await asAdmin(api().post(`/admin/series/${seriesId}/publish`)).expect(200);

    // Série limitée au Togo pour le filtre territorial de la recherche.
    const zone = await asAdmin(api().post('/admin/series'))
      .send({ title: `E2E Zone ${suffix}`, genres: ['e2e-genre'], territories: ['TG'] })
      .expect(201);
    zoneSeriesId = zone.body.id as string;
    seriesIds.push(zoneSeriesId);
    const zoneEp = await asAdmin(api().post(`/admin/series/${zoneSeriesId}/episodes`)).expect(201);
    await prisma.episode.update({
      where: { id: zoneEp.body.id as string },
      data: { transcodeStatus: 'READY', publishedAt: new Date(Date.now() - 60_000) },
    });
    await asAdmin(api().post(`/admin/series/${zoneSeriesId}/publish`)).expect(200);
  });

  afterAll(async () => {
    const ids = [...new Set(userIds)];
    if (seriesIds.length > 0) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    if (ids.length > 0) {
      await prisma.coinLedgerEntry.deleteMany({ where: { userId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { targetType: 'user', targetId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: adminIds } }, { targetId: { in: adminIds } }] },
    });
    await prisma.adminAccount.deleteMany({ where: { id: { in: adminIds } } });
    await app.close();
  });

  it('OTP: console provider writes the code in Redis; verify opens a REGISTERED session', async () => {
    const phone = `+2289${Date.now().toString().slice(-7)}`;
    const requested = await api().post('/auth/otp/request').send({ phone }).expect(200);
    expect(requested.body).toMatchObject({ expiresIn: 300, resendAfter: 60 });
    const requestId = requested.body.requestId as string;
    const code = await redis.client.get(otpDevCodeKey(requestId));
    expect(code).toMatch(/^\d{6}$/);

    await api().post('/auth/otp/request').send({ phone }).expect(429);

    await api()
      .post('/auth/otp/verify')
      .send({
        requestId,
        code: code === '000000' ? '111111' : '000000',
        deviceId: `e2e-${suffix}-otp`,
      })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('OTP_INVALID_CODE'));

    const session = await api()
      .post('/auth/otp/verify')
      .send({ requestId, code, deviceId: `e2e-${suffix}-otp` })
      .expect(200);
    userIds.push(session.body.user.id as string);
    expect(session.body).toMatchObject({
      expiresIn: expect.any(Number),
      linked: false,
      user: { type: 'REGISTERED', phone, providers: ['phone'], vipStatus: 'none' },
    });
    expect(await redis.client.get(otpDevCodeKey(requestId))).toBeNull();

    await bearer(session.body.accessToken as string)(api().get('/me'))
      .expect(200)
      .expect((res) => expect(res.body.phone).toBe(phone));
  });

  it('email register with a guest token upgrades the guest in place and keeps its progress', async () => {
    const g = await guest();
    await bearer(g.access)(api().put('/progress'))
      .send({ episodeId: episode1, positionSeconds: 12 })
      .expect(200);

    const session = await bearer(g.access)(api().post('/auth/email/register'))
      .send({ email: emailA, password: 'motdepasse-solide', deviceId: `e2e-${suffix}-dev-a` })
      .expect(201);
    expect(session.body).toMatchObject({
      linked: true,
      user: { id: g.id, type: 'REGISTERED', email: emailA, providers: ['email'] },
    });
    tokensA = {
      access: session.body.accessToken as string,
      refresh: session.body.refreshToken as string,
      id: g.id,
    };

    const progress = await prisma.watchProgress.findUnique({
      where: { userId_episodeId: { userId: g.id, episodeId: episode1 } },
    });
    expect(progress?.positionSeconds).toBe(12);

    await api()
      .post('/auth/email/register')
      .send({
        email: emailA.toUpperCase(),
        password: 'autre-mot-de-passe',
        deviceId: `e2e-${suffix}-x`,
      })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('EMAIL_TAKEN'));
    await api()
      .post('/auth/email/login')
      .send({ email: emailA, password: 'mauvais-mot-de-passe', deviceId: `e2e-${suffix}-x` })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('INVALID_CREDENTIALS'));
  });

  it('email login with another guest token merges that guest: favorites union, ledger transferred, guest MERGED', async () => {
    const b = await guest();
    await bearer(b.access)(api().put(`/me/favorites/${seriesId}`)).expect(204);
    await bearer(b.access)(api().put('/progress'))
      .send({ episodeId: episode1, positionSeconds: 40 })
      .expect(200);
    await prisma.$transaction([
      prisma.coinLedgerEntry.create({
        data: {
          userId: b.id,
          amount: 20,
          bucket: 'BONUS',
          type: 'BONUS',
          idempotencyKey: `e2e-${suffix}-bonus-b`,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      }),
      prisma.wallet.update({ where: { userId: b.id }, data: { bonusBalance: 20 } }),
    ]);

    const session = await bearer(b.access)(api().post('/auth/email/login'))
      .send({ email: emailA, password: 'motdepasse-solide', deviceId: `e2e-${suffix}-dev-b` })
      .expect(200);
    expect(session.body).toMatchObject({ linked: true, user: { id: tokensA.id } });
    tokensA.access = session.body.accessToken as string;
    tokensA.refresh = session.body.refreshToken as string;

    const [walletA, walletB, guestB, favorites, progressA, ledger, audit] = await Promise.all([
      prisma.wallet.findUnique({ where: { userId: tokensA.id } }),
      prisma.wallet.findUnique({ where: { userId: b.id } }),
      prisma.user.findUnique({ where: { id: b.id } }),
      prisma.favorite.findMany({ where: { userId: tokensA.id } }),
      prisma.watchProgress.findUnique({
        where: { userId_episodeId: { userId: tokensA.id, episodeId: episode1 } },
      }),
      prisma.coinLedgerEntry.findMany({
        where: { referenceType: 'account_merge', userId: { in: [tokensA.id, b.id] } },
      }),
      prisma.auditLog.findFirst({ where: { action: 'user.merge', targetId: tokensA.id } }),
    ]);
    expect(walletA?.bonusBalance).toBe(20);
    expect(walletB?.bonusBalance).toBe(0);
    expect(guestB).toMatchObject({ status: 'MERGED', mergedIntoId: tokensA.id });
    expect(favorites.map((f) => f.seriesId)).toContain(seriesId);
    expect(progressA?.positionSeconds).toBe(40);
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((s, l) => s + l.amount, 0)).toBe(0);
    expect(audit?.actorLabel).toBe(`user:${tokensA.id}`);

    // Les jetons de l'invité fusionné ne valent plus rien.
    await api().post('/auth/refresh').send({ refreshToken: b.refresh }).expect(401);
  });

  it('favorites and likes: idempotent, counted, reflected on series summaries only with a token', async () => {
    const me = bearer(tokensA.access);
    await me(api().put(`/me/favorites/${seriesId}`)).expect(204);
    await me(api().put(`/me/favorites/${zoneSeriesId}`)).expect(204);
    await me(api().put('/me/favorites/0192f1f0-8a5b-7c3d-9e1f-000000000000')).expect(404);

    const list = await me(api().get('/me/favorites?page=1&pageSize=10')).expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0]).toMatchObject({ id: zoneSeriesId, isFavorite: true, likes: 0 });

    const liked = await me(api().post(`/series/${seriesId}/like`)).expect(200);
    expect(liked.body).toEqual({ likes: 1, liked: true });
    await me(api().post(`/series/${seriesId}/like`))
      .expect(200)
      .expect({ likes: 1, liked: true });

    const detail = await me(api().get(`/series/${seriesId}`)).expect(200);
    expect(detail.body).toMatchObject({ isFavorite: true, likes: 1 });
    const anonymous = await api().get(`/series/${seriesId}`).expect(200);
    expect(anonymous.body.isFavorite).toBeUndefined();
    expect(anonymous.body.likes).toBeUndefined();

    const feed = await me(api().get('/feed?limit=30')).expect(200);
    const item = feed.body.items.find((i: { series: { id: string } }) => i.series.id === seriesId);
    expect(item).toMatchObject({ isFavorite: true, series: { isFavorite: true, likes: 1 } });
    expect(item.previewUrl).toContain(`hls/${episode1}/preview/index.m3u8`);
    expect(item.previewExpiresAt).toBeTruthy();

    await me(api().delete(`/series/${seriesId}/like`))
      .expect(200)
      .expect({ likes: 0, liked: false });
    await me(api().delete(`/me/favorites/${zoneSeriesId}`)).expect(204);
    await me(api().delete(`/me/favorites/${zoneSeriesId}`)).expect(204);
    const after = await me(api().get('/me/favorites')).expect(200);
    expect(after.body.total).toBe(1);
  });

  it('search: full text with accents ignored, prefix suggestions, genre and territory filters', async () => {
    const hit = await api().get(`/search?q=heritage ${suffix}`).expect(200);
    expect(hit.body.items.map((s: { id: string }) => s.id)).toContain(seriesId);
    expect(hit.body.suggestions).toContain(`E2E Héritage ${suffix}`);

    const byTag = await api().get(`/search?q=lagune-${suffix}`).expect(200);
    expect(byTag.body.items[0]?.id).toBe(seriesId);
    const bySynopsis = await api().get(`/search?q=testament lomé`).expect(200);
    expect(bySynopsis.body.items.map((s: { id: string }) => s.id)).toContain(seriesId);

    const prefix = await api().get(`/search/suggest?q=e2e hér`).expect(200);
    expect(prefix.body.suggestions).toContain(`E2E Héritage ${suffix}`);
    expect(prefix.body.suggestions.length).toBeLessThanOrEqual(8);

    const wrongGenre = await api().get(`/search?q=${suffix}&genre=nope`).expect(200);
    expect(wrongGenre.body.total).toBe(0);
    const outside = await api().get(`/search?q=zone ${suffix}`).set('X-Country', 'CI').expect(200);
    expect(outside.body.items.map((s: { id: string }) => s.id)).not.toContain(zoneSeriesId);
    const inside = await api().get(`/search?q=zone ${suffix}`).set('X-Country', 'TG').expect(200);
    expect(inside.body.items.map((s: { id: string }) => s.id)).toContain(zoneSeriesId);

    const personalised = await bearer(tokensA.access)(
      api().get(`/search?q=heritage ${suffix}`),
    ).expect(200);
    expect(personalised.body.items[0]).toMatchObject({ id: seriesId, isFavorite: true });
  });

  it('/me: PATCH, deferred DELETE (tokens revoked), re-login, cancel, then anonymisation job', async () => {
    const me = bearer(tokensA.access);
    const patched = await me(api().patch('/me'))
      .send({ displayName: 'Awa', country: 'ci', notificationPreferences: { offers: false } })
      .expect(200);
    expect(patched.body).toMatchObject({
      displayName: 'Awa',
      country: 'CI',
      notificationPreferences: { offers: false },
    });

    const deleted = await me(api().delete('/me')).expect(202);
    const scheduled = new Date(deleted.body.scheduledFor as string).getTime();
    expect(scheduled - Date.now()).toBeGreaterThan(29 * 86_400_000);
    await api().post('/auth/refresh').send({ refreshToken: tokensA.refresh }).expect(401);

    const again = await api()
      .post('/auth/email/login')
      .send({ email: emailA, password: 'motdepasse-solide', deviceId: `e2e-${suffix}-dev-a` })
      .expect(200);
    expect(again.body.user).toMatchObject({
      status: 'DELETION_PENDING',
      deletionScheduledAt: deleted.body.scheduledFor,
    });
    const restored = await bearer(again.body.accessToken as string)(
      api().post('/me/delete/cancel'),
    ).expect(200);
    expect(restored.body).toMatchObject({ status: 'ACTIVE', deletionScheduledAt: null });
    tokensA.access = again.body.accessToken as string;

    // Anonymisation : un compte OTP jetable dont le délai est échu.
    const victim = await guest();
    await bearer(victim.access)(api().put(`/me/favorites/${seriesId}`)).expect(204);
    await bearer(victim.access)(api().post(`/series/${seriesId}/like`)).expect(200);
    await prisma.user.update({
      where: { id: victim.id },
      data: {
        status: 'DELETION_PENDING',
        deletionScheduledAt: new Date(Date.now() - 1000),
        email: `victim-${suffix}@example.com`,
        identities: { create: { provider: 'EMAIL', subject: `victim-${suffix}@example.com` } },
      },
    });
    const done = await app.get(AccountDeletionService).runOnce();
    expect(done).toContain(victim.id);
    const anonymised = await prisma.user.findUnique({
      where: { id: victim.id },
      include: { identities: true, favorites: true, likes: true },
    });
    expect(anonymised).toMatchObject({
      status: 'DELETED',
      email: null,
      phone: null,
      displayName: 'Utilisateur supprimé',
      identities: [],
      favorites: [],
      likes: [],
    });
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      select: { likesCount: true },
    });
    expect(series?.likesCount).toBe(0);
  });

  it('logout revokes the refresh token family', async () => {
    const g = await guest();
    await bearer(g.access)(api().post('/auth/logout'))
      .send({ refreshToken: g.refresh })
      .expect(204);
    await api().post('/auth/refresh').send({ refreshToken: g.refresh }).expect(401);
  });

  it('signed playback in hmac mode: /play and /feed carry a verifiable token and expiry', async () => {
    process.env.MEDIA_SIGNER = 'hmac';
    process.env.MEDIA_SIGNING_KEY = HMAC_KEY;
    const hmacApp = await createApp();
    try {
      const play = await request(hmacApp.getHttpServer())
        .post(`/episodes/${episode1}/play`)
        .set('Authorization', `Bearer ${tokensA.access}`)
        .expect(200);
      const url = new URL(play.body.manifestUrl as string);
      expect(url.pathname.endsWith(`/hls/${episode1}/master.m3u8`)).toBe(true);
      expect(url.searchParams.get('token')).toBeTruthy();
      expect(Number(url.searchParams.get('expires')) * 1000).toBeGreaterThan(Date.now());
      expect(new Date(play.body.expiresAt as string).getTime()).toBe(
        Number(url.searchParams.get('expires')) * 1000,
      );
      expect(verifyMediaUrl(HMAC_KEY, play.body.manifestUrl as string)).toBe(true);
      expect(verifyMediaUrl('wrong-key-0123456789abcdef', play.body.manifestUrl as string)).toBe(
        false,
      );

      const feed = await request(hmacApp.getHttpServer()).get('/feed?limit=30').expect(200);
      const item = feed.body.items.find(
        (i: { series: { id: string } }) => i.series.id === seriesId,
      );
      expect(verifyMediaUrl(HMAC_KEY, item.previewUrl as string)).toBe(true);
      // Les vignettes et affiches ne sont jamais signées.
      expect(String(item.episode.thumbnailUrl ?? '')).not.toContain('token=');
    } finally {
      process.env.MEDIA_SIGNER = 'plain';
      delete process.env.MEDIA_SIGNING_KEY;
      await hmacApp.close();
    }
    const plain = await bearer(tokensA.access)(api().post(`/episodes/${episode1}/play`)).expect(
      200,
    );
    expect(plain.body.manifestUrl).not.toContain('token=');
  });

  it('scheduled publication: future dates stay hidden, /admin/schedule lists them, the job flips visibility', async () => {
    const before = await api().get(`/series/${seriesId}/episodes`).expect(200);
    expect(before.body.map((e: { id: string }) => e.id)).toEqual([episode1]);

    const schedule = await asAdmin(api().get('/admin/schedule')).expect(200);
    expect(schedule.body.items).toContainEqual(
      expect.objectContaining({ kind: 'episode', id: episode2, seriesId, willBeVisible: true }),
    );

    // Série programmée : PATCH publishedAt futur → disparaît du catalogue public et apparaît au calendrier.
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await asAdmin(api().patch(`/admin/series/${seriesId}`))
      .send({ publishedAt: future })
      .expect(200);
    await api().get(`/series/${seriesId}`).expect(404);
    const withSeries = await asAdmin(
      api().get(`/admin/schedule?from=${new Date().toISOString()}`),
    ).expect(200);
    expect(withSeries.body.items).toContainEqual(
      expect.objectContaining({ kind: 'series', id: seriesId, willBeVisible: true }),
    );
    await asAdmin(api().patch(`/admin/series/${seriesId}`))
      .send({ publishedAt: new Date(Date.now() - 60_000).toISOString() })
      .expect(200);
    await api().get(`/series/${seriesId}`).expect(200);

    // Bascule : la date de l'épisode 2 arrive sans passer par l'API (aucune invalidation) ; le cache
    // (réchauffé ici) sert encore l'ancienne grille jusqu'au passage de la tâche planifiée.
    await api().get(`/series/${seriesId}/episodes`).expect(200);
    await prisma.episode.update({
      where: { id: episode2 },
      data: { publishedAt: new Date(Date.now() - 1000) },
    });
    const stale = await api().get(`/series/${seriesId}/episodes`).expect(200);
    expect(stale.body).toHaveLength(1);
    const flip = await app.get(PublishSchedulerService).runOnce();
    expect(flip.episodeIds).toContain(episode2);
    const fresh = await api().get(`/series/${seriesId}/episodes`).expect(200);
    expect(fresh.body.map((e: { id: string }) => e.id)).toEqual([episode1, episode2]);

    await asAdmin(
      api().get('/admin/schedule?from=2026-01-01T00:00:00.000Z&to=2028-01-01T00:00:00.000Z'),
    )
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('SCHEDULE_RANGE_TOO_WIDE'));
  });

  it('GET /admin/stats/overview returns the dashboard shape with the test activity counted', async () => {
    // Redis est partagé avec l'API de dev : on repart d'un cache vide pour cette fenêtre.
    await redis.client.del(statsCacheKey(9));
    const stats = await asAdmin(api().get('/admin/stats/overview?days=9')).expect(200);
    expect(stats.body).toMatchObject({
      activeUsers: { d1: expect.any(Number), d7: expect.any(Number), d30: expect.any(Number) },
      newUsers: expect.any(Number),
      registeredUsers: expect.any(Number),
      guestUsers: expect.any(Number),
      episodesStarted: expect.any(Number),
      episodesCompleted: expect.any(Number),
      days: 9,
      generatedAt: expect.any(String),
    });
    expect(stats.body.activeUsers.d1).toBeGreaterThanOrEqual(1);
    expect(stats.body.topSeries).toContainEqual(
      expect.objectContaining({
        seriesId,
        title: `E2E Héritage ${suffix}`,
        viewers: expect.any(Number),
      }),
    );
    await asAdmin(api().get('/admin/stats/overview?days=400')).expect(400);
  });

  it('OpenAPI documents the sprint 4 routes (version >= 1.2.0)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const docApp = moduleRef.createNestApplication({ logger: false });
    const { setupSwagger } = await import('../src/openapi/openapi.js');
    setupSwagger(docApp);
    await docApp.init();
    const res = await request(docApp.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.info.version >= '1.2.0').toBe(true);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/google',
        '/auth/otp/request',
        '/auth/otp/verify',
        '/auth/email/register',
        '/auth/email/login',
        '/auth/logout',
        '/me',
        '/me/delete/cancel',
        '/me/favorites',
        '/me/favorites/{seriesId}',
        '/series/{id}/like',
        '/search',
        '/search/suggest',
        '/admin/schedule',
        '/admin/stats/overview',
      ]),
    );
    await docApp.close();
  });
});
