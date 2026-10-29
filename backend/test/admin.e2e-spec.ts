/**
 * Back-office de bout en bout (S03-BE-04, S03-BE-01, S03-BE-02, S02-BE-02, S02-BE-04, S02-BE-05) :
 * connexion 2FA, règles de rôle, CRUD séries / épisodes, URL pré-signée + PUT réel sur MinIO,
 * webhook de transcodage signé, limitation de débit. Le fournisseur de transcodage est forcé en
 * mode `webhook` pour ne pas lancer ffmpeg ici (le pipeline local est couvert par scripts/smoke-ingest.ts).
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';
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
const WEBHOOK_SECRET = process.env.TRANSCODE_WEBHOOK_SECRET;

const PASSWORD = 'E2e-Password!2026';
const suffix = Date.now().toString(36);

describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  const adminEmail = `e2e-admin-${suffix}@drama.local`;
  const editorEmail = `e2e-editor-${suffix}@drama.local`;
  const adminIds: string[] = [];
  const seriesIds: string[] = [];
  let adminToken = '';
  let editorToken = '';
  let minioUp = false;

  const api = () => request(app.getHttpServer());

  /** Connexion complète (mot de passe + enrôlement/validation TOTP) ; renvoie le JWT admin. */
  async function loginFlow(email: string): Promise<string> {
    const login = await api()
      .post('/admin/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(login.body.status).toBe('totp_setup_required');
    expect(login.body.otpauthUri).toContain(`secret=${login.body.secret as string}`);
    const verify = await api()
      .post('/admin/auth/totp/verify')
      .send({
        challengeToken: login.body.challengeToken,
        code: totpCode(login.body.secret as string),
      })
      .expect(200);
    expect(verify.body.user.email).toBe(email);
    return verify.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    config = app.get(AppConfig);
    configureApp(app, config);
    await app.init();

    // Les compteurs de limitation de débit (login par IP et par e-mail) persistent dans Redis entre
    // deux exécutions de la suite : on repart de zéro pour que les scénarios restent déterministes.
    const rlKeys = await app.get(RedisService).client.keys('rl:*');
    if (rlKeys.length > 0) await app.get(RedisService).client.del(...rlKeys);
    prisma = app.get(PrismaService);

    const redis = app.get(RedisService).client;
    const keys = await redis.keys('rl:*');
    if (keys.length > 0) await redis.del(...keys);

    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
    for (const [email, role] of [
      [adminEmail, 'ADMIN'],
      [editorEmail, 'EDITOR'],
    ] as const) {
      const acc = await prisma.adminAccount.create({
        data: { email, displayName: `E2E ${role}`, role, passwordHash },
      });
      adminIds.push(acc.id);
    }
    minioUp = await fetch(`${config.s3.endpoint}/minio/health/live`).then(
      (r) => r.ok,
      () => false,
    );
  });

  afterAll(async () => {
    if (seriesIds.length > 0) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    if (adminIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: adminIds } } });
      await prisma.adminAccount.deleteMany({ where: { id: { in: adminIds } } });
    }
    await app.close();
  });

  it('login → totp setup → verify → me → logout (token revoked afterwards)', async () => {
    adminToken = await loginFlow(adminEmail);
    editorToken = await loginFlow(editorEmail);

    const me = await api()
      .get('/admin/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(me.body).toEqual({
      id: adminIds[0],
      email: adminEmail,
      displayName: 'E2E ADMIN',
      role: 'ADMIN',
    });

    // Deuxième connexion : la 2FA est désormais enrôlée, pas de secret renvoyé.
    const again = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    expect(again.body).toEqual({ status: 'totp_required', challengeToken: expect.any(String) });
    await api()
      .post('/admin/auth/totp/verify')
      .send({ challengeToken: again.body.challengeToken, code: '000000' })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('INVALID_TOTP_CODE'));

    const audit = await prisma.auditLog.findMany({
      where: { actorId: adminIds[0], action: 'admin.login' },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);

    // Déconnexion d'une session secondaire : le jeton est refusé ensuite, l'autre reste valide.
    const second = await api()
      .post('/admin/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    const account = await prisma.adminAccount.findUniqueOrThrow({ where: { id: adminIds[0] } });
    const { SecretBox } = await import('../src/common/crypto/secret-box.js');
    const secret = new SecretBox(config.admin.totpEncryptionKey).open(account.totpSecret as string);
    const session2 = await api()
      .post('/admin/auth/totp/verify')
      .send({ challengeToken: second.body.challengeToken, code: totpCode(secret) })
      .expect(200);
    await api()
      .post('/admin/auth/logout')
      .set('Authorization', `Bearer ${session2.body.accessToken as string}`)
      .expect(204);
    await api()
      .get('/admin/auth/me')
      .set('Authorization', `Bearer ${session2.body.accessToken as string}`)
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('ADMIN_TOKEN_REVOKED'));
    await api().get('/admin/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });

  it('rejects /admin/* without a token or with a user JWT', async () => {
    await api()
      .get('/admin/series')
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('UNAUTHENTICATED'));
    const guest = await api()
      .post('/auth/guest')
      .send({ deviceId: 'e2e-admin-guest-01' })
      .expect(201);
    await api()
      .get('/admin/series')
      .set('Authorization', `Bearer ${guest.body.tokens.accessToken as string}`)
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('INVALID_ADMIN_TOKEN'));
    await prisma.user.delete({ where: { id: guest.body.user.id as string } });
  });

  it('rate-limits admin login: 5 attempts per e-mail per 15 minutes, 429 RATE_LIMITED', async () => {
    const email = `e2e-ratelimit-${suffix}@drama.local`;
    for (let i = 0; i < 5; i += 1) {
      await api()
        .post('/admin/auth/login')
        .send({ email, password: 'Wrong-Password!' })
        .expect(401);
    }
    const blocked = await api()
      .post('/admin/auth/login')
      .send({ email, password: 'Wrong-Password!' })
      .expect(429);
    expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('series CRUD with role rules, publish rule and audit trail', async () => {
    const created = await api()
      .post('/admin/series')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: `E2E Série ${suffix}`,
        genres: ['drame'],
        tags: ['test'],
        language: 'fr',
        ageRating: 'PG12',
      })
      .expect(201);
    seriesIds.push(created.body.id as string);
    expect(created.body).toMatchObject({
      slug: `e2e-serie-${suffix}`,
      status: 'DRAFT',
      episodeCount: 0,
      language: 'fr',
      freeEpisodeCount: 5,
    });

    // EDITOR ne peut pas toucher à la monétisation ; ADMIN oui ; SUPPORT n'écrit pas.
    await api()
      .patch(`/admin/series/${created.body.id as string}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ freeEpisodeCount: 2 })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('FORBIDDEN_FIELDS'));
    const patched = await api()
      .patch(`/admin/series/${created.body.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ freeEpisodeCount: 2, synopsis: 'Synopsis e2e' })
      .expect(200);
    expect(patched.body).toMatchObject({ freeEpisodeCount: 2, synopsis: 'Synopsis e2e' });

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'series.update', targetId: created.body.id as string },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.oldValue).toEqual({ freeEpisodeCount: 5, synopsis: '' });
    expect(entry?.newValue).toEqual({ freeEpisodeCount: 2, synopsis: 'Synopsis e2e' });

    await api()
      .post(`/admin/series/${created.body.id as string}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('SERIES_NO_READY_EPISODE'));

    const list = await api()
      .get(`/admin/series?q=E2E Série ${suffix}&status=DRAFT`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(created.body.id);

    const detail = await api()
      .get(`/admin/series/${created.body.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.slug).toBe(`e2e-serie-${suffix}`);
  });

  it('episodes: auto-numbering, reorder, upload-url (+ real PUT), uploaded, signed webhook → READY → publish', async () => {
    const seriesId = seriesIds[0];
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${editorToken}`);

    const ep1 = await auth(api().post(`/admin/series/${seriesId}/episodes`))
      .send({ title: 'Un' })
      .expect(201);
    const ep2 = await auth(api().post(`/admin/series/${seriesId}/episodes`))
      .send({})
      .expect(201);
    expect([ep1.body.number, ep2.body.number]).toEqual([1, 2]);
    expect(ep1.body.transcodeStatus).toBe('PENDING');

    const reordered = await auth(api().put(`/admin/series/${seriesId}/episodes/order`))
      .send({ episodeIds: [ep2.body.id, ep1.body.id] })
      .expect(200);
    expect(reordered.body.map((e: { id: string; number: number }) => [e.id, e.number])).toEqual([
      [ep2.body.id, 1],
      [ep1.body.id, 2],
    ]);
    await auth(api().put(`/admin/series/${seriesId}/episodes/order`))
      .send({ episodeIds: [ep1.body.id] })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('EPISODE_ORDER_MISMATCH'));

    const renamed = await auth(api().patch(`/admin/episodes/${ep1.body.id as string}`))
      .send({ title: 'Premier', publishedAt: '2026-11-01T08:00:00.000Z' })
      .expect(200);
    expect(renamed.body).toMatchObject({
      title: 'Premier',
      publishedAt: '2026-11-01T08:00:00.000Z',
    });

    await auth(api().post(`/admin/episodes/${ep1.body.id as string}/uploaded`))
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('SOURCE_MISSING'));

    const target = await auth(api().post(`/admin/episodes/${ep1.body.id as string}/upload-url`))
      .send({ fileName: 'e2e source.mp4', contentType: 'video/mp4', sizeBytes: 1024 })
      .expect(200);
    expect(target.body).toMatchObject({
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      sourceKey: `sources/${seriesId}/${ep1.body.id as string}/e2e-source.mp4`,
    });
    expect(target.body.uploadUrl).toContain(target.body.sourceKey);
    await auth(api().post(`/admin/episodes/${ep1.body.id as string}/upload-url`))
      .send({ fileName: 'x.avi', contentType: 'video/x-msvideo', sizeBytes: 10 })
      .expect(400);

    const poster = await auth(api().post('/admin/uploads/presign'))
      .send({ kind: 'poster', fileName: 'affiche.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(poster.body.publicUrl).toBe(`${config.cdnBaseUrl}/${poster.body.key as string}`);

    if (!minioUp) {
      console.warn('MinIO unreachable: skipping real PUT / uploaded / webhook assertions');
      return;
    }
    const put = await fetch(target.body.uploadUrl as string, {
      method: 'PUT',
      headers: target.body.headers as Record<string, string>,
      body: Buffer.alloc(1024, 1),
    });
    expect(put.status).toBe(200);

    const uploaded = await auth(
      api().post(`/admin/episodes/${ep1.body.id as string}/uploaded`),
    ).expect(200);
    // Mode webhook sans TRANSCODE_SUBMIT_URL : en attente du service géré.
    expect(uploaded.body.transcodeStatus).toBe('PROCESSING');

    const body = JSON.stringify({
      event: 'completed',
      sourceKey: target.body.sourceKey,
      durationSeconds: 95,
      thumbnailUrl: `${config.cdnBaseUrl}/hls/${ep1.body.id as string}/thumbnail.jpg`,
    });
    await api()
      .post('/webhooks/transcode/mux')
      .set('Content-Type', 'application/json')
      .set('X-Transcode-Signature', 'sha256=deadbeef')
      .send(body)
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('INVALID_WEBHOOK_SIGNATURE'));
    const signature = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;
    const ack = await api()
      .post('/webhooks/transcode/mux')
      .set('Content-Type', 'application/json')
      .set('X-Transcode-Signature', signature)
      .send(body)
      .expect(202);
    expect(ack.body).toEqual({ accepted: true, episodeId: ep1.body.id, transcodeStatus: 'READY' });

    const episodes = await auth(api().get(`/admin/series/${seriesId}/episodes`)).expect(200);
    const ready = episodes.body.find((e: { id: string }) => e.id === ep1.body.id);
    expect(ready).toMatchObject({
      transcodeStatus: 'READY',
      hlsKey: `hls/${ep1.body.id as string}/master.m3u8`,
      durationSeconds: 95,
      transcodeError: null,
    });

    const published = await auth(api().post(`/admin/series/${seriesId}/publish`)).expect(200);
    expect(published.body.status).toBe('PUBLISHED');
    expect(published.body.publishedAt).not.toBeNull();

    await auth(api().delete(`/admin/episodes/${ep2.body.id as string}`)).expect(204);
    const after = await auth(api().get(`/admin/series/${seriesId}/episodes`)).expect(200);
    expect(after.body).toHaveLength(1);
    const archived = await auth(api().post(`/admin/series/${seriesId}/archive`)).expect(200);
    expect(archived.body.status).toBe('ARCHIVED');
  });

  it('GET /metrics exposes Prometheus metrics (http histogram + transcode counters)', async () => {
    const res = await api().get('/metrics').expect(200);
    expect(res.text).toContain('drama_http_request_duration_seconds_bucket');
    expect(res.text).toContain('drama_transcode_jobs_total');
  });
});
