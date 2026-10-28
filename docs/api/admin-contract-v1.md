# Contrat API admin v1 (back-office ↔ backend)

Fixé par le développeur en chef au démarrage du sprint 2 (28 octobre 2026). Le backend l'implémente,
le back-office le consomme ; toute évolution passe par ce fichier puis par l'export OpenAPI.
Toutes les routes `/admin/*` exigent un jeton admin (`Authorization: Bearer`), sauf `login` et `totp/verify`.
Erreurs au format `ApiErrorDto` du backend (`statusCode, code, message, details?, path, timestamp, requestId`).

## Authentification admin

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `POST /admin/auth/login` | `{ email, password }` | `200 { status: "totp_required", challengeToken }` ou, à la première connexion, `200 { status: "totp_setup_required", challengeToken, secret, otpauthUri }` |
| `POST /admin/auth/totp/verify` | `{ challengeToken, code }` | `200 { accessToken, expiresIn, user }` |
| `GET /admin/auth/me` | | `200 user` |
| `POST /admin/auth/logout` | | `204` |

`user = { id, email, displayName, role }` avec `role ∈ EDITOR | MONETIZATION | SUPPORT | ADMIN`.
Le `challengeToken` expire en 5 minutes. Code TOTP à 6 chiffres, fenêtre ±1 pas de 30 s.
Limitation de débit : 5 tentatives de login par e-mail et par 15 minutes.

## Séries (B-01)

`AdminSeries = { id, slug, title, synopsis, genres: string[], tags: string[], language, ageRating: ALL|PG12|PG16|R18,
posterVerticalUrl, posterHorizontalUrl, freeEpisodeCount, coinCostPerEpisode, status: DRAFT|PUBLISHED|ARCHIVED,
territories: string[], episodeCount, publishedAt, createdAt, updatedAt }`

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /admin/series?page&pageSize&status&q` | | `{ items: AdminSeries[], total, page, pageSize }` |
| `POST /admin/series` | champs éditables | `201 AdminSeries` |
| `GET /admin/series/{id}` | | `AdminSeries` |
| `PATCH /admin/series/{id}` | champs éditables | `AdminSeries` |
| `POST /admin/series/{id}/publish` | | `AdminSeries` (refusé 409 si aucun épisode READY) |
| `POST /admin/series/{id}/archive` | | `AdminSeries` |

Champs éditables : `title, synopsis, genres, tags, language, ageRating, posterVerticalUrl, posterHorizontalUrl,
freeEpisodeCount, coinCostPerEpisode, territories`. Le `slug` est dérivé du titre à la création.
Rôles : EDITOR et ADMIN pour le catalogue ; `freeEpisodeCount` et `coinCostPerEpisode` modifiables par MONETIZATION et ADMIN.

## Épisodes et upload (B-02)

`AdminEpisode = { id, seriesId, number, title, durationSeconds, transcodeStatus: PENDING|UPLOADED|PROCESSING|READY|FAILED,
sourceKey, hlsKey, thumbnailUrl, previewKey, publishedAt, transcodeError, createdAt, updatedAt }`

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /admin/series/{id}/episodes` | | `AdminEpisode[]` triés par `number` |
| `POST /admin/series/{id}/episodes` | `{ title?, number? }` | `201 AdminEpisode` (numéro auto = max + 1) |
| `PATCH /admin/episodes/{id}` | `{ title?, publishedAt? }` | `AdminEpisode` |
| `DELETE /admin/episodes/{id}` | | `204` |
| `PUT /admin/series/{id}/episodes/order` | `{ episodeIds: string[] }` | `AdminEpisode[]` renumérotés |
| `POST /admin/episodes/{id}/upload-url` | `{ fileName, contentType, sizeBytes }` | `{ uploadUrl, method: "PUT", headers, sourceKey, expiresAt }` |
| `POST /admin/episodes/{id}/uploaded` | | `AdminEpisode` (statut UPLOADED, transcodage mis en file) |
| `POST /admin/episodes/{id}/retranscode` | | `AdminEpisode` |
| `POST /admin/uploads/presign` | `{ kind: "poster", fileName, contentType }` | `{ uploadUrl, method, headers, key, publicUrl }` |

Le fichier est envoyé par le navigateur directement vers le stockage objet (PUT sur `uploadUrl`), jamais via l'API.
Taille maximale d'un fichier maître : 2 Go. Types acceptés : `video/mp4`, `video/quicktime`.
Clés : `sources/{seriesId}/{episodeId}/{fileName}` et `hls/{episodeId}/master.m3u8`.

## Transcodage

- File BullMQ `transcode`. Adaptateur de dev : ffmpeg local (même échelle de rendus que `infra/media-samples/generate.sh`,
  HLS CMAF 360p à 1080p, extrait 15 s, vignette), lit la source dans MinIO, écrit sous `hls/{episodeId}/`.
- Adaptateur service géré : `POST /webhooks/transcode/{provider}` avec vérification de signature, à brancher
  dès que le fournisseur est choisi (S02-PM-01).
- Le back-office interroge `GET /admin/series/{id}/episodes` toutes les 5 s tant qu'un épisode est en PROCESSING.
