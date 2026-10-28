/**
 * Tests de bout en bout sur PostgreSQL + Redis réels (docker compose dev ou services CI).
 * Pré-requis : migrations appliquées (`npm run prisma:deploy`).
 */
import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfig } from '../src/config/app-config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, app.get(AppConfig));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  it('GET /health reports database and redis up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/live answers without dependencies', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('POST /auth/guest creates a guest with a wallet and working tokens, then /auth/refresh rotates', async () => {
    const guest = await request(app.getHttpServer())
      .post('/auth/guest')
      .send({ deviceId: 'e2e-device-0001', country: 'TG', language: 'fr' })
      .expect(201);

    const userId = guest.body.user.id as string;
    createdUserIds.push(userId);
    expect(guest.body.user).toMatchObject({ type: 'GUEST', country: 'TG', isVip: false });
    expect(guest.body.tokens.tokenType).toBe('Bearer');

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    expect(wallet).toMatchObject({ purchasedBalance: 0, bonusBalance: 0 });

    // Le JWT ouvre une route protégée (validation 404 => la garde est passée).
    await request(app.getHttpServer())
      .put('/progress')
      .set('Authorization', `Bearer ${guest.body.tokens.accessToken as string}`)
      .send({ episodeId: '0192f1f0-8a5b-7c3d-9e1f-000000000000', positionSeconds: 10 })
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('EPISODE_NOT_FOUND'));

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: guest.body.tokens.refreshToken })
      .expect(200);
    expect(refreshed.body.tokens.refreshToken).not.toBe(guest.body.tokens.refreshToken);

    // Réutilisation du jeton révoqué => 401 et famille révoquée.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: guest.body.tokens.refreshToken })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('REFRESH_TOKEN_REUSED'));
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.tokens.refreshToken })
      .expect(401);
  });

  it('rejects invalid bodies with VALIDATION_ERROR and protects routes without token', async () => {
    await request(app.getHttpServer())
      .post('/auth/guest')
      .send({ deviceId: 'short', extra: true })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('VALIDATION_ERROR'));

    await request(app.getHttpServer())
      .put('/progress')
      .send({ episodeId: '0192f1f0-8a5b-7c3d-9e1f-000000000000', positionSeconds: 1 })
      .expect(401)
      .expect((res) => expect(res.body.code).toBe('UNAUTHENTICATED'));
  });

  it('GET /home, /series and /feed are readable anonymously', async () => {
    const home = await request(app.getHttpServer()).get('/home').expect(200);
    expect(Array.isArray(home.body.rows)).toBe(true);
    const series = await request(app.getHttpServer()).get('/series?page=1&pageSize=5').expect(200);
    expect(series.body).toMatchObject({ page: 1, pageSize: 5 });
    const feed = await request(app.getHttpServer()).get('/feed?limit=2').expect(200);
    expect(Array.isArray(feed.body.items)).toBe(true);
  });

  it('GET /docs-json serves the OpenAPI document', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const docApp = moduleRef.createNestApplication({ logger: false });
    const { setupSwagger } = await import('../src/openapi/openapi.js');
    setupSwagger(docApp);
    await docApp.init();
    const res = await request(docApp.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.info.title).toBe('DRAMA API');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/auth/guest',
        '/auth/refresh',
        '/home',
        '/series',
        '/feed',
        '/progress',
      ]),
    );
    await docApp.close();
  });
});
