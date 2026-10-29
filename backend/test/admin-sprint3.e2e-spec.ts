/**
 * Sprint 3 de bout en bout (S03-BE-03, S04-BE-01, S04-BE-04, B-05, B-13) :
 * sous-titres (import SRT réel → VTT public, exposition sur /episodes et /play), configuration de
 * l'accueil → GET /home (pays, langue, cache invalidé), comptes internes et journal d'audit.
 */
import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { totpCode } from '../src/common/crypto/totp.js';
import { AppConfig } from '../src/config/app-config.js';
import { RedisService } from '../src/redis/redis.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StorageService } from '../src/storage/storage.service.js';

process.env.TRANSCODE_PROVIDER = 'webhook';
process.env.TRANSCODE_WORKER_ENABLED = 'false';
process.env.TRANSCODE_WEBHOOK_SECRET ??= 'e2e-transcode-webhook-secret-0123456789';

const PASSWORD = 'E2e-Password!2026';
const suffix = `s3${Date.now().toString(36)}`;

const BOM = String.fromCharCode(0xfeff);
const SRT = `${BOM}1\r\n00:00:01,000 --> 00:00:03,500\r\nBonjour Awa.\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,250\r\nTu as lu le testament ?\r\nIl cache un secret.\r\n`;

describe('Sprint 3 admin + public API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfig;
  const adminEmail = `e2e-admin-${suffix}@drama.local`;
  const editorEmail = `e2e-editor-${suffix}@drama.local`;
  const adminIds: string[] = [];
  const seriesIds: string[] = [];
  const rowIds: string[] = [];
  const userIds: string[] = [];
  let adminToken = '';
  let editorToken = '';
  let guestToken = '';
  let seriesId = '';
  let episodeId = '';
  let minioUp = false;

  const api = () => request(app.getHttpServer());
  const asAdmin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const asEditor = (r: request.Test) => r.set('Authorization', `Bearer ${editorToken}`);

  async function loginFlow(email: string, password = PASSWORD): Promise<string> {
    const login = await api().post('/admin/auth/login').send({ email, password }).expect(200);
    expect(login.body.status).toBe('totp_setup_required');
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
    config = app.get(AppConfig);
    configureApp(app, config);
    await app.init();

    // Les compteurs de limitation de débit (login par IP et par e-mail) persistent dans Redis entre
    // deux exécutions de la suite : on repart de zéro pour que les scénarios restent déterministes.
    const rlKeys = await app.get(RedisService).client.keys('rl:*');
    if (rlKeys.length > 0) await app.get(RedisService).client.del(...rlKeys);
    prisma = app.get(PrismaService);

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
    adminToken = await loginFlow(adminEmail);
    editorToken = await loginFlow(editorEmail);
    minioUp = await fetch(`${config.s3.endpoint}/minio/health/live`).then(
      (r) => r.ok,
      () => false,
    );

    const guest = await api()
      .post('/auth/guest')
      .send({ deviceId: `e2e-${suffix}-device`, country: 'TG', language: 'fr' })
      .expect(201);
    userIds.push(guest.body.user.id as string);
    guestToken = guest.body.tokens.accessToken as string;

    // Série publiée avec un épisode READY (fixture : le transcodage réel est couvert ailleurs).
    const created = await asEditor(api().post('/admin/series'))
      .send({ title: `E2E S3 ${suffix}`, genres: ['e2e-genre'], language: 'fr' })
      .expect(201);
    seriesId = created.body.id as string;
    seriesIds.push(seriesId);
    const ep = await asEditor(api().post(`/admin/series/${seriesId}/episodes`))
      .send({ title: 'Pilote' })
      .expect(201);
    episodeId = ep.body.id as string;
    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        transcodeStatus: 'READY',
        hlsKey: `hls/${episodeId}/master.m3u8`,
        durationSeconds: 60,
        publishedAt: new Date(Date.now() - 60_000),
      },
    });
    await asEditor(api().post(`/admin/series/${seriesId}/publish`)).expect(200);
  });

  afterAll(async () => {
    if (rowIds.length > 0) await prisma.homeRow.deleteMany({ where: { id: { in: rowIds } } });
    if (seriesIds.length > 0) await prisma.series.deleteMany({ where: { id: { in: seriesIds } } });
    if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (episodeId && minioUp) {
      await app
        .get(StorageService)
        .deletePrefix(`subtitles/${episodeId}/`)
        .catch(() => undefined);
    }
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: adminIds } }, { targetId: { in: adminIds } }] },
    });
    await prisma.adminAccount.deleteMany({
      where: { OR: [{ id: { in: adminIds } }, { email: { endsWith: `${suffix}@drama.local` } }] },
    });
    await app.close();
  });

  it('subtitles: SRT upload → VTT stored and exposed on /episodes and /play; delete removes it', async () => {
    const uploaded = await asEditor(api().post(`/admin/episodes/${episodeId}/subtitles`))
      .field('language', 'FR')
      .attach('file', Buffer.from(SRT, 'utf8'), 'episode-1.srt')
      .expect(201);
    expect(uploaded.body).toMatchObject({
      episodeId,
      language: 'fr',
      label: 'Français',
      fileUrl: `${config.cdnBaseUrl}/subtitles/${episodeId}/fr.vtt`,
    });

    // Ré-import de la même langue : remplacement, pas de doublon.
    await asEditor(api().post(`/admin/episodes/${episodeId}/subtitles`))
      .field('language', 'fr')
      .attach('file', Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n'), 'ep.vtt')
      .expect(201);
    const list = await asEditor(api().get(`/admin/episodes/${episodeId}/subtitles`)).expect(200);
    expect(list.body).toHaveLength(1);

    // Validations.
    await asEditor(api().post(`/admin/episodes/${episodeId}/subtitles`))
      .field('language', 'fr')
      .attach('file', Buffer.from('hello'), 'notes.txt')
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('SUBTITLE_INVALID_FORMAT'));
    await asEditor(api().post(`/admin/episodes/${episodeId}/subtitles`))
      .field('language', 'français')
      .attach('file', Buffer.from(SRT), 'ep.srt')
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));
    await asEditor(api().post(`/admin/episodes/${episodeId}/subtitles`))
      .field('language', 'en')
      .attach('file', Buffer.from('1\n00:00:00,000 -> 00:00:01,000\nx'), 'bad.srt')
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('SUBTITLE_PARSE_ERROR');
        expect(res.body.details.line).toBe(2);
      });
    await asEditor(api().post(`/admin/episodes/${episodeId}/subtitles`))
      .field('language', 'en')
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('SUBTITLE_FILE_REQUIRED'));

    // Exposition publique (cache invalidé par l'import).
    const episodes = await api().get(`/series/${seriesId}/episodes`).expect(200);
    expect(episodes.body[0].subtitles).toEqual([
      { language: 'fr', label: 'Français', url: uploaded.body.fileUrl },
    ]);
    expect(episodes.body[0].subtitleLanguages).toEqual(['fr']);

    const play = await api()
      .post(`/episodes/${episodeId}/play`)
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(play.body.subtitles).toEqual([
      { language: 'fr', label: 'Français', url: uploaded.body.fileUrl },
    ]);

    if (minioUp) {
      const url = (uploaded.body.fileUrl as string).replace(
        config.cdnBaseUrl,
        `${config.s3.endpoint}/${config.s3.bucket}`,
      );
      const res = await fetch(url, { headers: { Origin: 'http://localhost:3100' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/vtt');
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
      const body = await res.text();
      expect(body.startsWith('WEBVTT')).toBe(true);
      expect(body).toContain('00:00.000 --> 00:01.000');
    } else {
      console.warn('MinIO unreachable: skipping public VTT fetch');
    }

    await asEditor(api().delete(`/admin/subtitles/${uploaded.body.id as string}`)).expect(204);
    await asEditor(api().delete(`/admin/subtitles/${uploaded.body.id as string}`)).expect(404);
    const after = await api().get(`/series/${seriesId}/episodes`).expect(200);
    expect(after.body[0].subtitles).toEqual([]);
    const audit = await prisma.auditLog.findMany({
      where: { targetType: 'subtitle', targetId: uploaded.body.id as string },
    });
    expect(audit.map((a) => a.action).sort()).toEqual([
      'subtitle.delete',
      'subtitle.replace',
      'subtitle.upload',
    ]);
  });

  it('home configuration drives GET /home per country and language, cache invalidated on change', async () => {
    const key = `e2e-picks-${suffix}`;
    const row = await asEditor(api().post('/admin/home/rows'))
      .send({
        key,
        type: 'MANUAL',
        titles: { fr: 'Sélection', en: 'Picks' },
        seriesIds: [seriesId],
        countries: ['TG'],
      })
      .expect(201);
    rowIds.push(row.body.id as string);
    expect(row.body).toMatchObject({
      key,
      type: 'MANUAL',
      titles: { fr: 'Sélection', en: 'Picks', es: null, pt: null },
      countries: ['TG'],
    });
    await asEditor(api().post('/admin/home/rows'))
      .send({ key, type: 'NEW', titles: { fr: 'Doublon' } })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('HOME_ROW_KEY_TAKEN'));
    await asEditor(api().post('/admin/home/rows'))
      .send({ key: `${key}-g`, type: 'GENRE', titles: { fr: 'Sans genre' } })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('HOME_ROW_GENRE_REQUIRED'));

    const banner = await asEditor(api().post('/admin/home/banners'))
      .send({ seriesId, title: 'À la une', subtitle: 'E2E', countries: [] })
      .expect(201);
    expect(banner.body).toMatchObject({ seriesId, title: 'À la une', isActive: true });
    await asEditor(api().post('/admin/home/banners'))
      .send({ seriesId, startsAt: '2026-11-02T00:00:00.000Z', endsAt: '2026-11-01T00:00:00.000Z' })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('HOME_BANNER_WINDOW_INVALID'));

    type Row = { key: string; title: string; type: string; items: { series: { id: string } }[] };
    const findRow = (body: { rows: Row[] }) => body.rows.find((r) => r.key === key);

    // Sans pays : aucun filtre, titre fr.
    const anywhere = await api().get('/home').expect(200);
    expect(findRow(anywhere.body)).toMatchObject({ title: 'Sélection', type: 'MANUAL' });
    expect(findRow(anywhere.body)?.items.map((i) => i.series.id)).toEqual([seriesId]);
    expect(
      (anywhere.body.banners as { bannerId: string; bannerTitle: string }[]).find(
        (b) => b.bannerId === banner.body.id,
      ),
    ).toMatchObject({ id: seriesId, bannerTitle: 'À la une' });

    // Pays non ciblé : rangée absente ; pays ciblé + anglais : titre en.
    const ci = await api().get('/home').set('X-Country', 'CI').expect(200);
    expect(findRow(ci.body)).toBeUndefined();
    const tgEn = await api()
      .get('/home')
      .set('X-Country', 'tg')
      .set('Accept-Language', 'en-US,en;q=0.9,fr;q=0.5')
      .expect(200);
    expect(findRow(tgEn.body)?.title).toBe('Picks');
    // Langue non supportée : repli fr.
    const tgDe = await api()
      .get('/home')
      .set('X-Country', 'TG')
      .set('Accept-Language', 'de')
      .expect(200);
    expect(findRow(tgDe.body)?.title).toBe('Sélection');

    // Aperçu back-office = même construction, sans cache.
    const preview = await asEditor(api().get('/admin/home/preview?country=TG&lang=en')).expect(200);
    expect(findRow(preview.body)?.title).toBe('Picks');

    // Réordonnancement : l'ensemble complet est exigé.
    const rows = await asEditor(api().get('/admin/home/rows')).expect(200);
    const ids = (rows.body as { id: string }[]).map((r) => r.id);
    await asEditor(api().put('/admin/home/rows/order'))
      .send({ ids: [ids[0]] })
      .expect(ids.length > 1 ? 400 : 200);
    const reordered = await asEditor(api().put('/admin/home/rows/order'))
      .send({ ids: [...ids].reverse() })
      .expect(200);
    expect((reordered.body as { id: string; position: number }[])[0]).toMatchObject({
      id: ids[ids.length - 1],
      position: 1,
    });
    await asEditor(api().put('/admin/home/rows/order')).send({ ids }).expect(200);

    // Désactivation → invalidation du cache → rangée absente immédiatement.
    await asEditor(api().patch(`/admin/home/rows/${row.body.id as string}`))
      .send({ isActive: false })
      .expect(200);
    const afterPatch = await api().get('/home').set('X-Country', 'TG').expect(200);
    expect(findRow(afterPatch.body)).toBeUndefined();

    await asEditor(api().delete(`/admin/home/banners/${banner.body.id as string}`)).expect(204);
    const afterDelete = await api().get('/home').expect(200);
    expect(
      (afterDelete.body.banners as { bannerId: string }[]).some(
        (b) => b.bannerId === banner.body.id,
      ),
    ).toBe(false);

    const audit = await prisma.auditLog.findMany({
      where: { actorId: adminIds[1], targetType: { in: ['home_row', 'home_banner'] } },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'home_row.create',
        'home_row.update',
        'home_row.reorder',
        'home_banner.create',
        'home_banner.delete',
      ]),
    );
  });

  it('accounts: ADMIN only, password policy, self-lockout guard, reset-totp, audit listing', async () => {
    await asEditor(api().get('/admin/accounts'))
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('FORBIDDEN_ROLE'));

    const email = `e2e-support-${suffix}@drama.local`;
    await asAdmin(api().post('/admin/accounts'))
      .send({ email, displayName: 'Support', role: 'SUPPORT', password: 'short1!' })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));
    const created = await asAdmin(api().post('/admin/accounts'))
      .send({
        email: email.toUpperCase(),
        displayName: 'Support',
        role: 'SUPPORT',
        password: PASSWORD,
      })
      .expect(201);
    expect(created.body).toMatchObject({
      email,
      role: 'SUPPORT',
      isActive: true,
      totpEnrolled: false,
      lastLoginAt: null,
    });
    await asAdmin(api().post('/admin/accounts'))
      .send({ email, displayName: 'Dup', role: 'SUPPORT', password: PASSWORD })
      .expect(409)
      .expect((res) => expect(res.body.code).toBe('ADMIN_EMAIL_TAKEN'));

    const list = await asAdmin(api().get('/admin/accounts')).expect(200);
    expect((list.body as { email: string }[]).some((a) => a.email === email)).toBe(true);

    await asAdmin(api().patch(`/admin/accounts/${adminIds[0]}`))
      .send({ isActive: false })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('ADMIN_SELF_LOCKOUT'));
    await asAdmin(api().patch(`/admin/accounts/${adminIds[0]}`))
      .send({ role: 'EDITOR' })
      .expect(403);
    const patched = await asAdmin(api().patch(`/admin/accounts/${created.body.id as string}`))
      .send({ role: 'MONETIZATION', displayName: 'Monét.' })
      .expect(200);
    expect(patched.body).toMatchObject({ role: 'MONETIZATION', displayName: 'Monét.' });

    // Mot de passe réinitialisé puis première connexion (enrôlement TOTP) → totpEnrolled.
    const newPassword = 'Another-Password!2026';
    await asAdmin(api().post(`/admin/accounts/${created.body.id as string}/reset-password`))
      .send({ password: newPassword })
      .expect(204);
    await api().post('/admin/auth/login').send({ email, password: PASSWORD }).expect(401);
    await loginFlow(email, newPassword);
    const enrolled = await asAdmin(api().get('/admin/accounts')).expect(200);
    expect(
      (enrolled.body as { email: string; totpEnrolled: boolean }[]).find((a) => a.email === email),
    ).toMatchObject({ totpEnrolled: true });

    const reset = await asAdmin(
      api().post(`/admin/accounts/${created.body.id as string}/reset-totp`),
    ).expect(200);
    expect(reset.body.totpEnrolled).toBe(false);
    const relogin = await api()
      .post('/admin/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
    expect(relogin.body.status).toBe('totp_setup_required');

    // Désactivation : le compte ne se connecte plus.
    await asAdmin(api().patch(`/admin/accounts/${created.body.id as string}`))
      .send({ isActive: false })
      .expect(200);
    await api()
      .post('/admin/auth/login')
      .send({ email, password: newPassword })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('ADMIN_INACTIVE'));

    // Journal d'audit : filtres et pagination.
    const logs = await asAdmin(
      api().get(`/admin/audit-logs?actorId=${adminIds[0]}&action=admin_account.&pageSize=2`),
    ).expect(200);
    expect(logs.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(logs.body.total).toBeGreaterThanOrEqual(5);
    expect(logs.body.items).toHaveLength(2);
    expect(logs.body.items[0]).toMatchObject({
      actorId: adminIds[0],
      actorEmail: adminEmail,
      targetType: 'admin_account',
    });
    const byTarget = await asAdmin(
      api().get(`/admin/audit-logs?targetType=admin_account&targetId=${created.body.id as string}`),
    ).expect(200);
    const actions = (byTarget.body.items as { action: string }[]).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'admin_account.create',
        'admin_account.update',
        'admin_account.reset_password',
        'admin_account.reset_totp',
      ]),
    );
    const exact = await asAdmin(
      api().get(
        `/admin/audit-logs?action=admin_account.reset_totp&targetId=${created.body.id as string}`,
      ),
    ).expect(200);
    expect(exact.body.total).toBe(1);
    expect(exact.body.items[0]).toMatchObject({
      oldValue: { totpEnrolled: true },
      newValue: { totpEnrolled: false },
    });
    await asAdmin(api().get('/admin/audit-logs?from=not-a-date')).expect(400);
  });
});
