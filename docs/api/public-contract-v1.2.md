# Contrat API publique v1.2 — sprint 4 (29 octobre 2026)

Complète `docs/api/openapi.v1.json`. Le backend l'implémente, l'application Android le consomme.
Erreurs au format `ApiErrorDto`. Toutes les routes `/me*` et `/auth/*` de liaison exigent un jeton utilisateur.

## Lecture signée (S04-BE-02, S04-A2-01)

`POST /episodes/{id}/play` renvoie `manifestUrl` signée et `expiresAt` (ISO). Signature par un port `MediaUrlSigner` :
`plain` (dev MinIO : URL publique, `expiresAt` = maintenant + TTL, aucun contrôle), `hmac` (jeton `?token=<base64url(hmac-sha256(secret, path + expires))>&expires=<epoch>`
sur le préfixe du manifeste, compatible avec l'authentification par jeton des CDN de type Bunny ou KeyCDN). Sélection par
`MEDIA_SIGNER=plain|hmac`, secret `MEDIA_SIGNING_KEY`, durée `PLAYBACK_URL_TTL_SECONDS`.
Le client rejoue `POST /play` quand `expiresAt` est dépassé ou sur une erreur HTTP 403 du CDN.

## Authentification (S05-BE-01 à 03)

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `POST /auth/google` | `{ idToken, deviceId }` | `200 AuthSession` |
| `POST /auth/otp/request` | `{ phone }` (E.164) | `200 { requestId, expiresIn, resendAfter }` |
| `POST /auth/otp/verify` | `{ requestId, code, deviceId }` | `200 AuthSession` |
| `POST /auth/email/register` | `{ email, password, deviceId }` | `201 AuthSession` |
| `POST /auth/email/login` | `{ email, password, deviceId }` | `200 AuthSession` |
| `POST /auth/logout` | `{ refreshToken }` | `204` |

`AuthSession = { accessToken, refreshToken, expiresIn, user: UserDto, linked: boolean }`.
`UserDto = { id, type: GUEST|REGISTERED, displayName, email, phone, country, language, vipStatus, vipExpiresAt, providers: ("google"|"phone"|"email")[], createdAt }`.

**Rattachement (M-50)** : si l'appel porte un jeton d'un compte invité, l'identité est rattachée :
- identité inconnue → le compte invité devient REGISTERED en place (historique, progression, favoris, déblocages, portefeuille conservés), `linked=true` ;
- identité déjà liée à un autre compte → fusion de l'invité dans ce compte (progression : position la plus avancée ; favoris et déblocages : union ; grand livre : lignes de l'invité transférées avec une ligne d'ajustement journalisée ; l'invité est marqué MERGED et ses jetons révoqués), `linked=true`.

OTP : code à 6 chiffres, 5 min, 5 essais, renvoi après 60 s ; port `SmsProvider` avec implémentation `console` (dev : code écrit dans les logs et dans Redis sous `otp:<requestId>`) et une implémentation HTTP générique (`SMS_PROVIDER=console|http`, `SMS_HTTP_URL`, `SMS_HTTP_TOKEN`). Limitation de débit : 3 demandes par numéro par 15 min.
Google : vérification de l'`idToken` avec les audiences `GOOGLE_CLIENT_IDS` (liste) ; refus si non configuré (`GOOGLE_AUTH_DISABLED`).
E-mail : mot de passe ≥ 8 caractères, Argon2id, `EMAIL_TAKEN`, `INVALID_CREDENTIALS` ; réinitialisation par e-mail hors périmètre du sprint.

## Compte (S05-BE-04)

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /me` | | `UserDto` |
| `PATCH /me` | `{ displayName?, language?, country?, notificationPreferences? }` | `UserDto` |
| `DELETE /me` | | `202 { scheduledFor }` : suppression différée de 30 jours, compte désactivé immédiatement, jetons révoqués, anonymisation par tâche planifiée |
| `POST /me/delete/cancel` | | `200 UserDto` (dans le délai, par reconnexion) |

## Favoris et recherche (S05-BE-05, S05-BE-06)

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /me/favorites?page&pageSize` | | `{ items: SeriesSummary[], total, page, pageSize }` |
| `PUT /me/favorites/{seriesId}` · `DELETE` | | `204` (idempotents) |
| `POST /series/{id}/like` · `DELETE` | | `200 { likes, liked }` |
| `GET /search?q&genre&page&pageSize` | | `{ items: SeriesSummary[], total, page, pageSize, suggestions: string[] }` |
| `GET /search/suggest?q` | | `{ suggestions: string[] }` (titres, préfixe, 8 max) |

Recherche plein texte PostgreSQL (`tsvector` titre + synopsis + tags, dictionnaire `french` et `simple`, `unaccent`), séries publiées seulement, filtre territoires.
`SeriesSummary` gagne `isFavorite` et `likes` quand un jeton est présent.

## Flux « Pour vous » (M-02)

`GET /feed` existe ; il renvoie désormais pour chaque élément `previewUrl` signée comme `/play`, `episode { id, number, title }`, `series` et `isFavorite`. Pagination par curseur inchangée.

## Back-office (B-04, B-11 v0)

- **Planification (B-04)** : `publishedAt` futur accepté sur `PATCH /admin/series/{id}` et `PATCH /admin/episodes/{id}` ; le catalogue public ignore ce qui n'est pas encore daté ; une tâche planifiée (chaque minute) invalide le cache et envoie les notifications quand la date arrive. `GET /admin/schedule?from&to` liste les publications à venir.
- **Tableau de bord v0 (B-11)** : `GET /admin/stats/overview?days=7` → `{ activeUsers: { d1, d7, d30 }, newUsers, registeredUsers, guestUsers, episodesStarted, episodesCompleted, topSeries: [{ seriesId, title, viewers, completions }], generatedAt }` à partir de `users` et `watch_progress`, cache 5 min. Rôles : tous les rôles en lecture.
