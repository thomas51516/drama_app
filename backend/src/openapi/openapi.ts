import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';

/**
 * Version du contrat OpenAPI.
 * v0.1 (S01-BE-03) : auth invité, catalogue, lecture. v1.0 (S02-BE-03) : tous les endpoints du
 * cahier des charges §8.2 (les modules des sprints suivants répondent 501 `NOT_IMPLEMENTED` mais
 * leurs DTO sont figés pour le mock Android) + back-office (contrat admin v1).
 * v1.1 (sprint 3, addendum du contrat admin) : sous-titres (B-03), mise en avant (B-05) et `GET /home`
 * paramétré (X-Country, Accept-Language, cache), comptes internes et journal d'audit (B-13).
 * v1.2 (sprint 4, contrat public v1.2) : URLs de lecture signées (S04-BE-02), flux enrichi (S04-BE-03),
 * connexion Google / OTP / e-mail et rattachement du compte invité (S05-BE-01 à 03), `/me` et
 * suppression différée (S05-BE-04), favoris, « J'aime » et recherche (S05-BE-05, 06), publication
 * programmée (B-04) et tableau de bord v0 (B-11).
 * v1.3 (sprint 5, contrat v1.3) : appareils de confiance du back-office (B-13+), notifications push,
 * historique in-app et campagnes (M-54, S06-BE-01, B-10), centre d'aide et support (M-53, S06-BE-02),
 * événements d'analyse (S06-BE-03) et compléments du tableau de bord.
 * v1.4 (sprint 6, contrat v1.4) : portefeuille et grand livre (S07-BE-01/04), déblocage par pièces
 * atomique et idempotent, déblocage automatique dans `/play` (S07-BE-02/03), boutique et achats Google
 * Play avec RTDN et abonnement VIP (S07-BE-06/07), monétisation, barème de check-in et utilisateurs en
 * back-office (B-06, B-08, B-09), `current` sur les appareils de confiance, défauts de recette DEF-002/003/004/008/009.
 * v1.5 (sprint 7, contrat v1.5) : check-in quotidien et tâches récompensées avec administration (S08-BE-04, B-08),
 * pub récompensée avec sessions et callback SSV `admob` | `fake` (S08-BE-03), déblocage de série entière, offre de
 * bienvenue, offres limitées et codes promo (S10-BE-02/03, B-07), recharge mobile money `fake` | `cinetpay` avec
 * réconciliation (S09-BE-01/02), classements (M-04), genres localisés (DEF-012), `series.adUnlockEnabled`.
 */
export const OPENAPI_VERSION = '1.5.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DRAMA API')
    .setDescription(
      [
        'API du MVP de micro-séries verticales (Android) et du back-office.',
        '',
        '**Principes** : le serveur fait foi (solde, droits, prix) ; toutes les erreurs suivent le schéma `ApiErrorDto` avec un `code` stable à localiser côté application.',
        '',
        '**Authentification app** : `POST /auth/guest` au premier lancement, puis `Authorization: Bearer <accessToken>` ; renouveler avec `POST /auth/refresh` (rotation, jeton à usage unique). Connexion Google (`/auth/google`), OTP SMS (`/auth/otp/*`) et e-mail (`/auth/email/*`) : avec le jeton du compte invité dans `Authorization`, l’invité est rattaché (inscrit en place) ou fusionné dans le compte retrouvé (`linked=true`, M-50).',
        '',
        '**Lecture** : `POST /episodes/{id}/play` et `GET /feed` renvoient des URLs signées et expirantes (`MEDIA_SIGNER=plain|hmac`) ; redemander l’URL après `expiresAt` ou sur un 403 du CDN. Épisode verrouillé : `403 EPISODE_LOCKED { coinCost, balance, canAutoUnlock }`, ou déblocage automatique dans la même requête (`unlocked: true`) quand `autoUnlock` est activé et le solde suffisant.',
        '',
        '**Pièces et achats** : le grand livre `coin_ledger` est la seule source de vérité (`GET /wallet`, `GET /wallet/transactions`) ; `POST /episodes/{id}/unlock` débite bonus puis achetées dans la même transaction que le déblocage (idempotent, `402 INSUFFICIENT_COINS`). `GET /shop` donne les prix dans la devise de `X-Country` ; `POST /billing/google/verify` vérifie le jeton côté serveur (`BILLING_VERIFIER=google|fake`), crédite une seule fois par `purchaseToken` et acquitte ; `POST /webhooks/google-rtdn` traite renouvellements, annulations et remboursements.',
        '',
        '**Authentification back-office** : `POST /admin/auth/login` (mot de passe) puis `POST /admin/auth/totp/verify` (code TOTP, 2FA obligatoire) ; le JWT admin (`aud: admin`) est distinct du JWT utilisateur. `rememberDevice: true` renvoie un `deviceToken` (30 jours) qui, présenté au login, dispense du TOTP (`status: ok`).',
        '',
        '**Notifications** : `PUT /me/devices/push` enregistre le jeton FCM ; `GET /me/notifications` est l’historique in-app (`new_episode`, `support_reply`, `campaign`). Plafond : 2 push par utilisateur et par jour, préférences `notificationPreferences` de `PATCH /me` respectées. `POST /events` reçoit le plan de marquage du §13.',
        '',
        '**Récompenses et pub** : `GET/POST /rewards/checkin` (barème sur 7 jours, jour civil du fuseau du pays, `409 CHECKIN_ALREADY_CLAIMED`), `GET /rewards/tasks` + `POST /rewards/tasks/{id}/claim` (progression calculée côté serveur) ; pub récompensée : `GET /ads/eligibility`, `POST /ads/sessions` → `customData` à passer à la régie, callback SSV `GET|POST /ads/reward` (signature ECDSA AdMob ou HMAC `fake`) qui crée le déblocage `method: ad`, `GET /ads/sessions/{id}` pour le sondage.',
        '',
        '**Série entière, offres, recharge** : `GET /series/{id}/unlock-all/quote` et `POST /series/{id}/unlock-all` (remise `seriesUnlockDiscountPercent`, une transaction) ; `GET /offers` (bienvenue, offres limitées) et `POST /promo/redeem` ; recharge mobile money `POST /topup/orders` → `paymentUrl`, `GET /topup/orders/{id}`, webhook signé `POST /webhooks/mobile-money/{provider}` (crédit idempotent), réconciliation `GET /admin/topup/reconciliation?date`. `GET /rankings?period` (spectateurs distincts, cache 10 min) et `GET /genres?lang` (libellés localisés).',
        '',
        '**Limitation de débit** : `/auth/*` (par IP, par e-mail, 3 OTP par numéro et 15 min) et `/admin/auth/*` renvoient `429 RATE_LIMITED` (en-têtes `Retry-After`, `X-RateLimit-*`).',
        '',
        '**Catalogue** : `X-Country` (ISO 3166-1 alpha-2) et `Accept-Language` (fr, en, es, pt) personnalisent `GET /home` et les filtres territoriaux ; `GET /home` est mis en cache 60 s par pays et langue, `GET /series/{id}` et `/episodes` 120 s (variante anonyme), invalidés à chaque modification en back-office et quand une publication programmée est atteinte. Avec un jeton, les résumés de séries portent `isFavorite` et `likes` (calculés hors cache).',
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
    .addTag(
      'users',
      'Profil, suppression différée, favoris, « J’aime », appareils push et notifications (M-16, M-52, M-54)',
    )
    .addTag('help', 'Centre d’aide : FAQ, contact et suivi des demandes (M-53)')
    .addTag('analytics', 'Événements d’analyse côté serveur (§13)')
    .addTag('webhooks', 'Rappels serveur à serveur (signature, pas de JWT)')
    .addTag('admin-auth', 'Back-office : connexion 2FA (B-13)')
    .addTag('admin-series', 'Back-office : séries (B-01)')
    .addTag('admin-episodes', 'Back-office : épisodes, upload, transcodage (B-02)')
    .addTag('admin-subtitles', 'Back-office : sous-titres SRT/VTT par langue (B-03)')
    .addTag('admin-home', 'Back-office : bannières et rangées de l’accueil, par pays (B-05)')
    .addTag('admin-accounts', 'Back-office : comptes internes, rôles et journal d’audit (B-13)')
    .addTag('admin-schedule', 'Back-office : calendrier des publications programmées (B-04)')
    .addTag('admin-stats', 'Back-office : tableau de bord v0 (B-11)')
    .addTag('admin-campaigns', 'Back-office : campagnes push ciblées (B-10)')
    .addTag('admin-help', 'Back-office : FAQ et boîte de réception du support (B-03bis)')
    .addTag(
      'admin-monetization',
      'Back-office : paramètres de monétisation, packs, formules VIP, barème de check-in (B-06, B-08)',
    )
    .addTag('admin-users', 'Back-office : recherche d’utilisateurs, portefeuille, blocage (B-09)')
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
