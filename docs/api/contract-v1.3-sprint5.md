# Contrat API v1.3 — sprint 5 (30 octobre 2026)

Complète les contrats précédents. Erreurs au format `ApiErrorDto`.

## Appareil de confiance pour le back-office (B-13, demande du client)

- `POST /admin/auth/totp/verify` accepte `rememberDevice: boolean`. Si vrai, la réponse ajoute `deviceToken` (aléatoire 256 bits, haché en base, lié au compte, 30 jours, révocable) et `deviceTokenExpiresAt`.
- `POST /admin/auth/login` accepte `deviceToken?`. S'il est valide pour ce compte et que le TOTP est enrôlé, la réponse est directement `{ status: "ok", accessToken, expiresIn, user }` ; sinon le flux TOTP habituel. Un jeton invalide est ignoré silencieusement.
- `GET /admin/auth/devices` liste les appareils de confiance du compte (`id, label, createdAt, lastUsedAt, expiresAt`) ; `DELETE /admin/auth/devices/{id}` révoque ; `POST /admin/accounts/{id}/revoke-devices` (ADMIN) révoque tout. Réinitialiser le TOTP révoque tous les appareils.
- Côté web : case « Se souvenir de cet appareil pendant 30 jours » sur l'écran du code ; le `deviceToken` est stocké dans un cookie `drama_admin_device` (Secure, SameSite=Strict, 30 jours) et envoyé au login ; page « Mon compte » listant les appareils avec révocation.

## Notifications push (M-54, S06-BE-01, B-10)

Port `PushProvider` : `fcm` (Firebase Admin SDK, compte de service dans `FIREBASE_SERVICE_ACCOUNT_JSON` ou chemin `FIREBASE_SERVICE_ACCOUNT_FILE`) et `log` (dev : écrit dans les logs et dans `push_deliveries`). `PUSH_PROVIDER=log|fcm`.

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `PUT /me/devices/push` | `{ token, platform: "android", locale, appVersion }` | `204` (upsert par token, lié à l'utilisateur courant) |
| `DELETE /me/devices/push/{token}` | | `204` |
| `GET /me/notifications?page&pageSize` | | `{ items: [{ id, type, title, body, data, sentAt, readAt }], total, ... }` (historique in-app) |
| `POST /me/notifications/{id}/read` | | `204` |

Préférences dans `PATCH /me` : `notificationPreferences: { newEpisodes: bool, offers: bool, checkinReminder: bool }` (défaut tout vrai).
Déclencheurs automatiques : nouvel épisode READY et visible d'une série en favoris (`type=new_episode`, data `{ seriesId, episodeId }`, regroupé par série et par heure, plafond 2 push par utilisateur et par jour toutes causes confondues). Les rappels de check-in et offres viennent aux sprints 7-8.

Campagnes (B-10, admin, rôles MONETIZATION et ADMIN) :
`Campaign = { id, title, body, deepLink?, segment: { type: ALL|COUNTRY|SERIES_FOLLOWERS|INACTIVE, countries?, seriesId?, inactiveDays? }, scheduledAt?, status: DRAFT|SCHEDULED|SENDING|SENT|CANCELLED, audienceCount, sentCount, createdBy, createdAt }`

| Méthode et route | Réponse |
| --- | --- |
| `GET /admin/campaigns` · `POST` · `GET/PATCH /admin/campaigns/{id}` · `DELETE` (brouillon) | `Campaign` |
| `POST /admin/campaigns/{id}/estimate` | `{ audienceCount }` |
| `POST /admin/campaigns/{id}/send` | `Campaign` (envoi immédiat ou à `scheduledAt`, par lots via BullMQ, respecte préférences `offers` et plafond quotidien) |
| `POST /admin/campaigns/{id}/cancel` | `Campaign` |

## Centre d'aide et support (M-53, S06-BE-02)

`FaqEntry = { id, category, question: {fr,en,es,pt}, answer: {fr,en,es,pt}, position, isPublished }`

| Méthode et route | Réponse |
| --- | --- |
| `GET /help/faq?lang` | `{ categories: [{ key, title, entries: [{ id, question, answer }] }] }` (publiées, langue demandée avec repli fr) |
| `POST /help/contact` | `{ subject, message, email?, category }` → `201 { ticketId }` (utilisateur courant, 5 par jour par utilisateur, e-mail de confirmation si `email`) |
| `GET /admin/faq` · `POST` · `PATCH /admin/faq/{id}` · `DELETE` · `PUT /admin/faq/order` | `FaqEntry` (EDITOR, SUPPORT, ADMIN) |
| `GET /admin/support/tickets?status&page` · `GET /admin/support/tickets/{id}` · `POST /admin/support/tickets/{id}/reply` `{ message }` · `POST /admin/support/tickets/{id}/close` | `Ticket = { id, userId, userLabel, category, subject, status: OPEN|ANSWERED|CLOSED, messages: [{ from: user|support, body, at }], createdAt, updatedAt }` (SUPPORT, ADMIN) |

Réponse du support visible dans l'app via `GET /me/notifications` (`type=support_reply`) et dans `GET /help/tickets` (historique de l'utilisateur).

## Événements d'analyse côté serveur (S06-BE-03)

`POST /events` `{ events: [{ name, params, at }] }` (max 50 par appel, noms limités à la liste du §13 du cahier des charges) → `202`. Stockés dans `analytics_events` (user, session, pays, version). Les tableaux de bord B-11 s'appuient dessus en plus de `watch_progress` : ajout dans `GET /admin/stats/overview` de `paywallViews`, `unlocks` (0 pour l'instant) et `pushOpens`.

## Exploitation (S05-OPS-01, S06-OPS-01)

- `infra/docker-compose.dev.yml` : service `postgres-backup` (pg_dump quotidien compressé vers un volume, rétention 14 jours) ; scripts `infra/scripts/backup.sh` et `restore.sh` documentés ; procédure PITR notée pour la base managée du staging.
- `infra/monitoring/prometheus/alerts.yml` : alertes p95 lecture > 300 ms sur 5 min, taux 5xx > 1 %, API down, transcodage en échec, file BullMQ en retard.
