/**
 * Sprint 5 de bout en bout (contrat v1.3) : appareil de confiance du back-office (B-13+), appareils
 * push, notification « nouvel épisode » avec le fournisseur `log`, campagnes (estimation, envoi en
 * ligne, plafond quotidien), FAQ publique et admin, contact → ticket → réponse → notification,
 * événements d'analyse et compléments du tableau de bord.
 */
import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { statsCacheKey } from '../src/admin/stats/admin-stats.service.js';
import { totpCode } from '../src/common/crypto/totp.js';
import { AppConfig } from '../src/config/app-config.js';
import { contactLimitKey } from '../src/help/support.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NewEpisodeNotifier } from '../src/push/new-episode-notifier.service.js';
import { RedisService } from '../src/redis/redis.service.js';

process.env.TRANSCODE_PROVIDER = 'webhook';
process.env.TRANSCODE_WORKER_ENABLED = 'false';
process.env.TRANSCODE_WEBHOOK_SECRET ??= 'e2e-transcode-webhook-secret-0123456789';
process.env.SCHEDULER_ENABLED = 'false';
process.env.SMS_PROVIDER = 'console';
process.env.MEDIA_SIGNER = 'plain';
process.env.PUSH_PROVIDER = 'log';
process.env.PUSH_QUEUE_ENABLED = 'false';
process.env.PUSH_DAILY_CAP = '2';

const PASSWORD = 'E2e-Password!2026';
const suffix = `s5${Date.now().toString(36)}`;

describe('Sprint 5 API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const adminEmail = `e2e-admin-${suffix}@drama.local`;
  const editorEmail = `e2e-editor-${suffix}@drama.local`;
  const adminIds: string[] = [];
  const seriesIds: string[] = [];
  const userIds: string[] = [];
  const campaignIds: string[] = [];
  const faqIds: string[] = [];
  let adminToken = '';
  let editorToken = '';
  let deviceToken = '';
  let seriesId = '';
  let episode2 = '';
  let userA = { id: '', access: '' };
  let userB = { id: '', access: '' };
  let userC = { id: '', access: '' };
  let ticketId = '';

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function guest(): Promise<{ id: string; access: string }> {
    const res = await api()
      .post('/auth/guest')
      .send({ deviceId: `e2e-${suffix}-${Math.random().toString(36).slice(2, 10)}`, country: 'TG' })
      .expect(201);
    userIds.push(res.body.user.id as string);
    return { id: res.body.user.id as string, access: res.body.tokens.accessToken as string };
  }

  async function enrol(email: string, rememberDevice = false) {
    const login = await api()
      .post('/admin/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(login.body.status).toBe('totp_setup_required');
    const verify = await api()
      .post('/admin/auth/totp/verify')
      .send({
        challengeToken: login.body.challengeToken,
        code: totpCode(login.body.secret as string),
        rememberDevice,
      })
      .expect(200);
    return verify.body as {
      accessToken: string;
      deviceToken?: string;
      deviceTokenExpiresAt?: string;
    };
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
    for (const [email, role] of [
      [adminEmail, 'ADMIN'],
      [editorEmail, 'EDITOR'],
    ] as const) {
      const acc = await prisma.adminAccount.create({
        data: { email, displayName: `E2E ${role} S5`, role, passwordHash },
      });
      adminIds.push(acc.id);
    }
  });

  afterAll(async () => {
    if (campaignIds.length > 0) {
      await prisma.pushDelivery.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    }
    if (faqIds.length > 0) await prisma.faqEntry.deleteMany({ where: { id: { in: faqIds } } });
    if (userIds.length > 0) {
      await prisma.pushDelivery.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.analyticsEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      for (const id of userIds) {
        const keys = await redis.client.keys(`push:cap:${id}:*`);
        if (keys.length > 0) await redis.client.del(...keys);
      }
    }
    if (seriesIds.length > 0) {
      for (const id of seriesIds) {
        const keys = await redis.client.keys(`push:new_episode:${id}:*`);
        if (keys.length > 0) await redis.client.del(...keys);
      }
      await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    }
    if (adminIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: adminIds } } });
      await prisma.auditLog.deleteMany({
        where: { actorLabel: { in: adminIds.map((id) => `admin:${id}`) } },
      });
      await prisma.adminAccount.deleteMany({ where: { id: { in: adminIds } } });
    }
    await app.close();
  });

  // ------------------------------------------------------------ appareil de confiance

  it('rememberDevice → deviceToken → login skips TOTP → revoke → TOTP required again', async () => {
    const session = await enrol(adminEmail, true);
    adminToken = session.accessToken;
    expect(session.deviceToken).toEqual(expect.any(String));
    expect(Buffer.from(session.deviceToken!, 'base64url')).toHaveLength(32);
    expect(new Date(session.deviceTokenExpiresAt!).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
    deviceToken = session.deviceToken!;
    editorToken = (await enrol(editorEmail)).accessToken;

    const fast = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD, deviceToken })
      .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36')
      .expect(200);
    expect(fast.body.status).toBe('ok');
    expect(fast.body.challengeToken).toBeUndefined();
    expect(fast.body.user.email).toBe(adminEmail);
    await api()
      .get('/admin/auth/me')
      .set('Authorization', `Bearer ${fast.body.accessToken as string}`)
      .expect(200);

    // Le jeton d'un autre compte est ignoré silencieusement.
    const other = await api()
      .post('/admin/auth/login')
      .send({ email: editorEmail, password: PASSWORD, deviceToken })
      .expect(200);
    expect(other.body.status).toBe('totp_required');

    const devices = await asAdmin(api().get('/admin/auth/devices')).expect(200);
    expect(devices.body).toHaveLength(1);
    expect(devices.body[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      lastUsedAt: expect.any(String),
    });
    await asAdmin(api().delete(`/admin/auth/devices/${devices.body[0].id as string}`)).expect(204);
    expect((await asAdmin(api().get('/admin/auth/devices')).expect(200)).body).toEqual([]);

    const again = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD, deviceToken })
      .expect(200);
    expect(again.body.status).toBe('totp_required');

    // Révocation globale par un ADMIN et audit des méthodes de connexion.
    await asAdmin(api().post(`/admin/accounts/${adminIds[0]}/revoke-devices`)).expect(204);
    const methods = await prisma.auditLog.findMany({
      where: { actorId: adminIds[0], action: 'admin.login' },
      select: { newValue: true },
    });
    expect(methods.map((m) => (m.newValue as { method: string }).method)).toEqual(
      expect.arrayContaining(['password+totp', 'password+device']),
    );
  });

  // ------------------------------------------------------------------------ push

  it('registers push devices and notifies followers when an episode becomes visible (log provider)', async () => {
    userA = await guest();
    userB = await guest();
    userC = await guest();
    for (const [u, i] of [userA, userB, userC].map((u, i) => [u, i] as const)) {
      await bearer(u.access)(api().put('/me/devices/push'))
        .send({
          token: `e2e-fcm-${suffix}-${i}`,
          platform: 'android',
          locale: 'fr-FR',
          appVersion: '1.0',
        })
        .expect(204);
    }
    // Idempotent et rattachement au dernier compte connecté.
    await bearer(userA.access)(api().put('/me/devices/push'))
      .send({ token: `e2e-fcm-${suffix}-0`, platform: 'android' })
      .expect(204);
    expect(await prisma.pushDevice.count({ where: { userId: userA.id } })).toBe(1);
    // C refuse les offres (campagnes) mais garde les nouveaux épisodes.
    await bearer(userC.access)(api().patch('/me'))
      .send({ notificationPreferences: { offers: false } })
      .expect(200);

    const created = await asAdmin(api().post('/admin/series'))
      .send({
        title: `E2E Push ${suffix}`,
        synopsis: 'Une série suivie de près.',
        genres: ['e2e-genre'],
        language: 'fr',
      })
      .expect(201);
    seriesId = created.body.id as string;
    seriesIds.push(seriesId);
    const ep1 = await asAdmin(api().post(`/admin/series/${seriesId}/episodes`))
      .send({ title: 'Pilote' })
      .expect(201);
    await prisma.episode.update({
      where: { id: ep1.body.id as string },
      data: {
        transcodeStatus: 'READY',
        hlsKey: 'hls/samples/ep1/master.m3u8',
        publishedAt: new Date(),
      },
    });
    await asAdmin(api().post(`/admin/series/${seriesId}/publish`)).expect(200);
    for (const u of [userA, userB, userC]) {
      await bearer(u.access)(api().put(`/me/favorites/${seriesId}`)).expect(204);
    }

    // Épisode 2 prêt et publié il y a 20 min (hors fenêtre du planificateur de l'API de dev).
    const ep2 = await asAdmin(api().post(`/admin/series/${seriesId}/episodes`))
      .send({ title: 'Suite' })
      .expect(201);
    episode2 = ep2.body.id as string;
    await prisma.episode.update({
      where: { id: episode2 },
      data: {
        transcodeStatus: 'READY',
        hlsKey: 'hls/samples/ep2/master.m3u8',
        publishedAt: new Date(Date.now() - 20 * 60_000),
      },
    });
    const notifier = app.get(NewEpisodeNotifier);
    expect(await notifier.notifyEpisode(episode2)).toEqual({ notified: 3 });
    expect(await notifier.notifyEpisode(episode2)).toEqual({ notified: 0, skipped: 'grouped' });

    const inbox = await bearer(userA.access)(api().get('/me/notifications')).expect(200);
    expect(inbox.body).toMatchObject({ total: 1, unreadCount: 1, page: 1, pageSize: 20 });
    expect(inbox.body.items[0]).toMatchObject({
      type: 'new_episode',
      title: `Nouvel épisode de E2E Push ${suffix}`,
      body: 'L’épisode 2 est disponible.',
      data: { seriesId, episodeId: episode2 },
      readAt: null,
    });
    const deliveries = await prisma.pushDelivery.findMany({ where: { userId: userA.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      provider: 'log',
      status: 'SENT',
      token: `e2e-fcm-${suffix}-0`,
    });

    await bearer(userA.access)(
      api().post(`/me/notifications/${inbox.body.items[0].id as string}/read`),
    ).expect(204);
    const after = await bearer(userA.access)(api().get('/me/notifications')).expect(200);
    expect(after.body.unreadCount).toBe(0);
    expect(after.body.items[0].readAt).toEqual(expect.any(String));
    await bearer(userA.access)(api().post(`/me/notifications/${episode2}/read`)).expect(404);
  });

  // ------------------------------------------------------------------- campagnes

  it('campaign: estimate honours the offers preference, send respects the daily cap (log provider)', async () => {
    await bearer(editorToken)(api().get('/admin/campaigns')).expect(403);

    const bad = await asAdmin(api().post('/admin/campaigns'))
      .send({ title: 'x', body: 'y', segment: { type: 'COUNTRY' } })
      .expect(400);
    expect(bad.body.code).toBe('SEGMENT_INVALID');

    const created = await asAdmin(api().post('/admin/campaigns'))
      .send({
        title: `Promo ${suffix}`,
        body: 'Deux fois plus de pièces ce week-end.',
        deepLink: 'drama://shop',
        segment: { type: 'SERIES_FOLLOWERS', seriesId },
      })
      .expect(201);
    const id = created.body.id as string;
    campaignIds.push(id);
    expect(created.body).toMatchObject({
      status: 'DRAFT',
      audienceCount: 2,
      sentCount: 0,
      createdBy: adminEmail,
      segment: { type: 'SERIES_FOLLOWERS', seriesId },
    });
    const estimate = await asAdmin(api().post(`/admin/campaigns/${id}/estimate`)).expect(200);
    expect(estimate.body).toEqual({ audienceCount: 2 });

    const byCountry = await asAdmin(api().patch(`/admin/campaigns/${id}`))
      .send({ segment: { type: 'COUNTRY', countries: ['tg'] } })
      .expect(200);
    expect(byCountry.body.segment).toEqual({ type: 'COUNTRY', countries: ['TG'] });
    expect(byCountry.body.audienceCount).toBeGreaterThanOrEqual(2);
    await asAdmin(api().patch(`/admin/campaigns/${id}`))
      .send({ segment: { type: 'SERIES_FOLLOWERS', seriesId } })
      .expect(200);

    // A a déjà reçu 1 push ; on le porte au plafond (2) avant l'envoi : il doit être ignoré.
    await bearer(userA.access)(api().post('/help/contact'))
      .send({
        subject: 'Pré-plafond',
        message: 'Message de dix caractères au moins.',
        category: 'other',
      })
      .expect(201);
    const preTicket = await prisma.supportTicket.findFirstOrThrow({ where: { userId: userA.id } });
    await asAdmin(api().post(`/admin/support/tickets/${preTicket.id}/reply`))
      .send({ message: 'Deuxième push du jour.' })
      .expect(200);

    const sent = await asAdmin(api().post(`/admin/campaigns/${id}/send`)).expect(200);
    expect(sent.body).toMatchObject({ status: 'SENT', audienceCount: 2, sentCount: 1 });
    const rows = await prisma.pushDelivery.findMany({
      where: { campaignId: id },
      orderBy: { userId: 'asc' },
    });
    expect(rows.map((r) => [r.userId, r.status, r.error]).sort()).toEqual(
      [
        [userA.id, 'SKIPPED', 'daily_cap'],
        [userB.id, 'SENT', null],
      ].sort(),
    );
    const inboxB = await bearer(userB.access)(api().get('/me/notifications')).expect(200);
    expect(inboxB.body.items[0]).toMatchObject({
      type: 'campaign',
      title: `Promo ${suffix}`,
      data: { campaignId: id, deepLink: 'drama://shop' },
    });
    // C (offres désactivées) n'a rien reçu de la campagne.
    const inboxC = await bearer(userC.access)(api().get('/me/notifications')).expect(200);
    expect(inboxC.body.items.map((i: { type: string }) => i.type)).toEqual(['new_episode']);

    await asAdmin(api().post(`/admin/campaigns/${id}/send`)).expect(409);
    await asAdmin(api().delete(`/admin/campaigns/${id}`)).expect(409);

    // Programmée : reste SCHEDULED, annulable.
    const scheduled = await asAdmin(api().post('/admin/campaigns'))
      .send({
        title: `Plus tard ${suffix}`,
        body: 'Corps',
        segment: { type: 'ALL' },
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    campaignIds.push(scheduled.body.id as string);
    const queued = await asAdmin(
      api().post(`/admin/campaigns/${scheduled.body.id as string}/send`),
    ).expect(200);
    expect(queued.body.status).toBe('SCHEDULED');
    const cancelled = await asAdmin(
      api().post(`/admin/campaigns/${scheduled.body.id as string}/cancel`),
    ).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const list = await asAdmin(api().get('/admin/campaigns?status=CANCELLED')).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toContain(scheduled.body.id);
  });

  // ------------------------------------------------------------------------- FAQ

  it('FAQ: admin CRUD and order, public read with language fallback and caching per language', async () => {
    const entry = await bearer(editorToken)(api().post('/admin/faq'))
      .send({
        category: 'coins',
        question: {
          fr: `Comment gagner des pièces ? ${suffix}`,
          en: `How do I earn coins? ${suffix}`,
        },
        answer: { fr: 'Avec le check-in quotidien.' },
      })
      .expect(201);
    faqIds.push(entry.body.id as string);
    const hidden = await asAdmin(api().post('/admin/faq'))
      .send({
        category: 'account',
        question: { fr: `Brouillon ${suffix}` },
        answer: { fr: 'Pas encore publié.' },
        isPublished: false,
      })
      .expect(201);
    faqIds.push(hidden.body.id as string);

    const en = await api().get('/help/faq?lang=en').expect(200);
    const coins = en.body.categories.find((c: { key: string }) => c.key === 'coins');
    expect(coins.title).toBe('Coins');
    const item = coins.entries.find((e: { id: string }) => e.id === entry.body.id);
    expect(item).toEqual({
      id: entry.body.id,
      question: `How do I earn coins? ${suffix}`,
      answer: 'Avec le check-in quotidien.',
    });
    const es = await api().get('/help/faq').set('Accept-Language', 'es-ES,es;q=0.9').expect(200);
    const esItem = es.body.categories
      .flatMap((c: { entries: { id: string; question: string }[] }) => c.entries)
      .find((e: { id: string }) => e.id === entry.body.id);
    expect(esItem.question).toBe(`Comment gagner des pièces ? ${suffix}`);
    const allIds = es.body.categories.flatMap((c: { entries: { id: string }[] }) =>
      c.entries.map((e) => e.id),
    );
    expect(allIds).not.toContain(hidden.body.id);

    await asAdmin(api().put('/admin/faq/order'))
      .send({ ids: [hidden.body.id, entry.body.id] })
      .expect(200);
    const listed = await asAdmin(api().get('/admin/faq')).expect(200);
    const positions = new Map(
      listed.body.map((e: { id: string; position: number }) => [e.id, e.position]),
    );
    expect(positions.get(hidden.body.id)).toBe(0);
    expect(positions.get(entry.body.id)).toBe(1);

    await asAdmin(api().patch(`/admin/faq/${hidden.body.id as string}`))
      .send({ isPublished: true })
      .expect(200);
    const fr = await api().get('/help/faq?lang=fr').expect(200);
    expect(fr.body.categories.map((c: { key: string }) => c.key).slice(0, 2)).toEqual([
      'account',
      'coins',
    ]);
    await asAdmin(api().delete(`/admin/faq/${hidden.body.id as string}`)).expect(204);
    await asAdmin(api().delete(`/admin/faq/${hidden.body.id as string}`)).expect(404);
  });

  // ---------------------------------------------------------------------- support

  it('contact → ticket → reply → support_reply notification → close, with the daily limit', async () => {
    await bearer(editorToken)(api().get('/admin/support/tickets')).expect(403);
    const contact = await bearer(userB.access)(api().post('/help/contact'))
      .send({
        subject: 'Pièces non créditées',
        message: 'J’ai acheté un pack hier et rien n’est arrivé.',
        email: 'awa@example.com',
        category: 'payment',
      })
      .expect(201);
    ticketId = contact.body.ticketId as string;

    const mine = await bearer(userB.access)(api().get('/help/tickets')).expect(200);
    expect(mine.body.total).toBe(1);
    expect(mine.body.items[0]).toMatchObject({
      id: ticketId,
      status: 'OPEN',
      category: 'payment',
      messages: [{ from: 'user', body: 'J’ai acheté un pack hier et rien n’est arrivé.' }],
    });

    const open = await asAdmin(api().get('/admin/support/tickets?status=OPEN')).expect(200);
    expect(open.body.items.map((t: { id: string }) => t.id)).toContain(ticketId);
    const replied = await asAdmin(api().post(`/admin/support/tickets/${ticketId}/reply`))
      .send({ message: 'Bonjour, les pièces viennent d’être créditées.' })
      .expect(200);
    expect(replied.body).toMatchObject({
      status: 'ANSWERED',
      userLabel: expect.any(String),
      messages: [
        { from: 'user' },
        { from: 'support', body: 'Bonjour, les pièces viennent d’être créditées.' },
      ],
    });
    const inbox = await bearer(userB.access)(api().get('/me/notifications')).expect(200);
    expect(inbox.body.items[0]).toMatchObject({
      type: 'support_reply',
      title: 'Réponse du support',
      body: 'Bonjour, les pièces viennent d’être créditées.',
      data: { ticketId },
    });
    const closed = await asAdmin(api().post(`/admin/support/tickets/${ticketId}/close`)).expect(
      200,
    );
    expect(closed.body.status).toBe('CLOSED');
    const detail = await asAdmin(api().get(`/admin/support/tickets/${ticketId}`)).expect(200);
    expect(detail.body.messages).toHaveLength(2);

    // Limite : 5 demandes par jour et par utilisateur (compteur Redis forcé à la limite).
    await redis.client.set(contactLimitKey(userB.id), '5', 'EX', 600);
    const limited = await bearer(userB.access)(api().post('/help/contact'))
      .send({
        subject: 'Encore',
        message: 'Message de dix caractères au moins.',
        category: 'other',
      })
      .expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  // -------------------------------------------------------------------- analytics

  it('POST /events validates the §13 names, stores the context and feeds the stats overview', async () => {
    const at = new Date().toISOString();
    const ok = await bearer(userA.access)(api().post('/events'))
      .set('X-Country', 'ci')
      .send({
        sessionId: `sess-${suffix}`,
        appVersion: '1.4.0',
        events: [
          { name: 'paywall_view', params: { seriesId, episodeNumber: 6 }, at },
          { name: 'push_open', params: { type: 'new_episode' }, at },
          { name: 'app_open', at },
        ],
      })
      .expect(202);
    expect(ok.body).toEqual({ accepted: 3 });
    const stored = await prisma.analyticsEvent.findMany({ where: { userId: userA.id } });
    expect(stored).toHaveLength(3);
    expect(stored.find((e) => e.name === 'paywall_view')).toMatchObject({
      country: 'CI',
      appVersion: '1.4.0',
      sessionId: `sess-${suffix}`,
      params: { seriesId, episodeNumber: 6 },
    });

    // Sans jeton : accepté avec user_id nul (événements avant la session invité).
    await api()
      .post('/events')
      .send({ events: [{ name: 'app_open', at }] })
      .expect(202);
    const anonymous = await prisma.analyticsEvent.findFirst({
      where: { userId: null, name: 'app_open' },
      orderBy: { receivedAt: 'desc' },
    });
    expect(anonymous).not.toBeNull();
    await prisma.analyticsEvent.deleteMany({ where: { id: anonymous!.id } });

    const unknown = await bearer(userA.access)(api().post('/events'))
      .send({ events: [{ name: 'rocket_launch', at }] })
      .expect(400);
    expect(unknown.body.code).toBe('VALIDATION_ERROR');
    const tooBig = await bearer(userA.access)(api().post('/events'))
      .send({ events: [{ name: 'share', params: { blob: 'x'.repeat(3000) }, at }] })
      .expect(400);
    expect(tooBig.body.code).toBe('EVENT_PARAMS_TOO_LARGE');
    await bearer(userA.access)(api().post('/events'))
      .send({ events: Array.from({ length: 51 }, () => ({ name: 'app_open', at })) })
      .expect(400);

    await redis.client.del(statsCacheKey(2));
    const stats = await asAdmin(api().get('/admin/stats/overview?days=2')).expect(200);
    expect(stats.body.paywallViews).toBeGreaterThanOrEqual(1);
    expect(stats.body.pushOpens).toBeGreaterThanOrEqual(1);
    // B-11 (sprint 9) : `unlocks` est désormais un vrai comptage (COUNT(*) FROM unlocks), plus un
    // 0 figé ; il dépend des déblocages réels de la fenêtre partagée avec l'API de dev, donc on
    // vérifie seulement la forme du champ plutôt qu'une valeur exacte.
    expect(stats.body.unlocks).toBeGreaterThanOrEqual(0);
    await redis.client.del(statsCacheKey(2));
  });
});
