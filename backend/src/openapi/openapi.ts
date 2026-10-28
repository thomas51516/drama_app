import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';

/** Version du contrat OpenAPI (S01-BE-03 : v0.1 = auth, catalogue, lecture). */
export const OPENAPI_VERSION = '0.1.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DRAMA API')
    .setDescription(
      [
        'API du MVP de micro-séries verticales (Android).',
        '',
        '**Principes** : le serveur fait foi (solde, droits, prix) ; toutes les erreurs suivent le schéma `ApiErrorDto` avec un `code` stable à localiser côté application.',
        '',
        '**Authentification** : `POST /auth/guest` au premier lancement, puis `Authorization: Bearer <accessToken>` ; renouveler avec `POST /auth/refresh` (rotation, jeton à usage unique).',
      ].join('\n'),
    )
    .setVersion(OPENAPI_VERSION)
    .setContact('Équipe backend DRAMA', '', '')
    .addServer('http://localhost:3000', 'Développement local')
    .addServer('https://api.staging.drama.example', 'Recette (S01-OPS-03)')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: "JWT d'accès (15 min)" },
      'bearer',
    )
    .addTag('health', 'Supervision')
    .addTag('auth', 'Compte invité et jetons (M-50)')
    .addTag('catalog', 'Accueil, séries, épisodes, flux (M-01, M-02, M-10)')
    .addTag('playback', 'Lecture et progression (M-11, M-15)')
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
