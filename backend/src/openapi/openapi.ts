import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';

/**
 * Version du contrat OpenAPI.
 * v0.1 (S01-BE-03) : auth invité, catalogue, lecture. v1.0 (S02-BE-03) : tous les endpoints du
 * cahier des charges §8.2 (les modules des sprints suivants répondent 501 `NOT_IMPLEMENTED` mais
 * leurs DTO sont figés pour le mock Android) + back-office (contrat admin v1).
 */
export const OPENAPI_VERSION = '1.0.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DRAMA API')
    .setDescription(
      [
        'API du MVP de micro-séries verticales (Android) et du back-office.',
        '',
        '**Principes** : le serveur fait foi (solde, droits, prix) ; toutes les erreurs suivent le schéma `ApiErrorDto` avec un `code` stable à localiser côté application.',
        '',
        '**Authentification app** : `POST /auth/guest` au premier lancement, puis `Authorization: Bearer <accessToken>` ; renouveler avec `POST /auth/refresh` (rotation, jeton à usage unique).',
        '',
        '**Authentification back-office** : `POST /admin/auth/login` (mot de passe) puis `POST /admin/auth/totp/verify` (code TOTP, 2FA obligatoire) ; le JWT admin (`aud: admin`) est distinct du JWT utilisateur.',
        '',
        '**Endpoints planifiés** : les opérations marquées « Planifié S0x » répondent `501 NOT_IMPLEMENTED` jusqu’à leur sprint ; leurs schémas de requête et de réponse sont contractuels dès maintenant (mock Android).',
        '',
        '**Limitation de débit** : `/auth/guest`, `/auth/refresh`, `/admin/auth/*` renvoient `429 RATE_LIMITED` (en-têtes `Retry-After`, `X-RateLimit-*`).',
      ].join('\n'),
    )
    .setVersion(OPENAPI_VERSION)
    .setContact('Équipe backend DRAMA', '', '')
    .addServer('http://localhost:3000', 'Développement local')
    .addServer('https://api.staging.drama.example', 'Recette (S01-OPS-03)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: "JWT d'accès utilisateur (15 min)",
      },
      'bearer',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT admin (aud: admin)',
      },
      'admin',
    )
    .addTag('health', 'Supervision')
    .addTag('auth', 'Compte invité, Google, OTP et jetons (M-50, M-51)')
    .addTag('catalog', 'Accueil, séries, épisodes, recherche, flux (M-01, M-02, M-10)')
    .addTag('playback', 'Lecture et progression (M-11, M-15)')
    .addTag('unlock', 'Déblocage par pièces et pub récompensée (M-20, M-21)')
    .addTag('wallet', 'Portefeuille et historique (M-30)')
    .addTag('billing', 'Google Play Billing et mobile money (§10)')
    .addTag('rewards', 'Check-in et tâches (M-40, M-41)')
    .addTag('users', 'Profil, suppression de compte, favoris (M-16, M-52)')
    .addTag('webhooks', 'Rappels serveur à serveur (signature, pas de JWT)')
    .addTag('admin-auth', 'Back-office : connexion 2FA (B-13)')
    .addTag('admin-series', 'Back-office : séries (B-01)')
    .addTag('admin-episodes', 'Back-office : épisodes, upload, transcodage (B-02)')
    .build();

  return SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorDto],
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
}

export function setupSwagger(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    yamlDocumentUrl: 'docs-yaml',
    customSiteTitle: 'DRAMA API — documentation',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });
}
