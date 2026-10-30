# Contrat API v1.5 — sprint 7 (30 octobre 2026)

Complète les contrats précédents. Règles §8.4 inchangées : grand livre seul support, idempotence, transactions atomiques,
aucun crédit sur simple signal de l'application (pub et paiement crédités uniquement sur callback serveur vérifié).

## Récompenses (M-40, M-41, S08-BE-04)

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /rewards/checkin` | | `{ scale: [7], streakDay (0..7), claimedToday, nextClaimAt, resetOnMiss }` |
| `POST /rewards/checkin` | `{ idempotencyKey }` | `200 { day, coins, wallet }` ; déjà réclamé → `409 CHECKIN_ALREADY_CLAIMED { nextClaimAt }` |
| `GET /rewards/tasks` | | `{ tasks: [{ id, key, title, description, coins, target, progress, status: AVAILABLE|CLAIMABLE|CLAIMED|LOCKED, expiresAt }] }` |
| `POST /rewards/tasks/{id}/claim` | `{ idempotencyKey }` | `200 { coins, wallet }` ; `409 TASK_NOT_CLAIMABLE` |

Jour de check-in = date civile dans le fuseau du pays (`Africa/Lome` par défaut) ; `resetOnMiss` remet la série à 1 après un jour manqué.
Tâches du MVP (clés fixes) : `watch_3_episodes` (par jour), `watch_10_episodes` (hebdo), `enable_notifications`, `share_series`, `complete_profile`, `add_favorite`.
Progression alimentée côté serveur par `watch_progress`, `POST /events` (`share`, `push_permission_granted`) et l'état du compte. Tout crédit = ligne BONUS avec expiration `bonusValidityDays`.
Admin B-08 : `GET /admin/rewards/tasks` · `PATCH /admin/rewards/tasks/{key}` `{ coins, target, isActive }` (MONETIZATION, ADMIN).

## Pub récompensée (M-22, S08-BE-03)

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /ads/eligibility?episodeId` | | `{ eligible, remainingToday, dailyCap, reason?: CAP_REACHED|SERIES_NOT_ELIGIBLE|ALREADY_UNLOCKED|NO_PROVIDER, adUnitId, provider }` |
| `POST /ads/sessions` | `{ episodeId }` | `201 { sessionId, customData, expiresAt }` (à passer à la régie en SSV custom data) |
| `GET /ads/reward` et `POST /ads/reward` | callback serveur de la régie (SSV) | `200` ; crée le déblocage `method: "ad"` si la session est valide ; idempotent par `transaction_id` |
| `GET /ads/sessions/{id}` | | `{ status: PENDING|REWARDED|EXPIRED|REJECTED, unlocked: bool }` (sondage de l'app après la pub) |

Port `AdSsvVerifier` : `admob` (signature ECDSA vérifiée avec les clés publiques Google, cache 24 h) et `fake` (dev et tests uniquement, refusé en production : signature HMAC `AD_SSV_FAKE_SECRET`). `AD_PROVIDER=fake|admob`, `AD_SSV_FAKE_SECRET`, `ADMOB_REWARDED_UNIT_ID`.
Plafond quotidien `adDailyCap` (paramètres) ; séries éligibles : `series.adUnlockEnabled` (nouveau champ, défaut vrai, éditable B-06/B-01).

## Déblocage de série entière et offres (M-23, M-24, B-07, S10-BE-02/03)

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /series/{id}/unlock-all/quote` | | `{ lockedCount, fullPrice, discountPercent, price }` |
| `POST /series/{id}/unlock-all` | `{ idempotencyKey }` | `200 { unlockedEpisodeIds, charged, wallet }` ; `402 INSUFFICIENT_COINS` |
| `GET /offers` | | `{ welcome: { packSku, bonusPercent, expiresAt } \| null, limited: [{ id, title, packSku, bonusPercent, endsAt }] }` |
| `POST /promo/redeem` | `{ code, idempotencyKey }` | `200 { coins, wallet }` ; `404 PROMO_INVALID` ; `409 PROMO_ALREADY_USED \| PROMO_EXPIRED \| PROMO_EXHAUSTED` |

Offre de bienvenue : bonus en % sur le premier achat d'un compte, durée `welcomeOfferHours` après la création ; appliquée côté serveur au crédit de l'achat.
Admin B-07 (MONETIZATION, ADMIN) : `GET/PUT /admin/offers/welcome` `{ isActive, packSku, bonusPercent, hours }` ; `GET/POST/PATCH/DELETE /admin/offers/limited` ; `GET/POST/PATCH /admin/promo-codes` `{ code, coins, maxUses, perUserUses, startsAt, endsAt, isActive }` + `GET /admin/promo-codes/{id}/redemptions`.

## Classements (M-04)

`GET /rankings?period=day|week|all&genre=` → `{ period, items: [{ rank, series: SeriesSummary, viewers }] }` (compteurs distincts sur `watch_progress`, cache 10 min). Admin : rien.

## Recharge mobile money (M-34, S09-BE-01, S09-BE-02)

Port `MobileMoneyProvider` : `fake` (dev : page de paiement simulée servie par l'API, boutons Payer / Échouer) et `cinetpay` (initialisation de paiement et vérification HMAC du webhook ; clés `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET`). `MOBILE_MONEY_PROVIDER=fake|cinetpay`.

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `POST /topup/orders` | `{ packSku, country, phone?, idempotencyKey }` | `201 { orderId, amount: Price, paymentUrl, expiresAt }` |
| `GET /topup/orders/{id}` | | `{ status: PENDING|PAID|FAILED|EXPIRED, coins, creditedAt }` |
| `GET /topup/orders?page` | | historique de l'utilisateur |
| `POST /webhooks/mobile-money/{provider}` | callback signé | `200` ; crédit idempotent par `providerReference` (PURCHASE + BONUS) |
| `GET /admin/topup/reconciliation?date` | | `{ date, orders, paid, credited, mismatches: [...] }` (MONETIZATION, ADMIN) + tâche quotidienne qui journalise les écarts |

Le site de recharge (Nuxt, `web/apps/recharge`) utilise l'authentification publique existante (OTP, e-mail, Google) et ces routes ; rendu serveur, mobile d'abord, moins de 300 Ko par page.

## Genres localisés (DEF-012)

`GET /genres?lang` → `{ items: [{ key, label }] }` ; `SeriesSummary.genres` reste la liste des clés. Le client affiche les libellés localisés.

## Lecture (M-17, M-18)

Aucun changement d'API : économie de données et protection des captures sont côté client. `EpisodeSummary` expose déjà `access` ; l'app active `FLAG_SECURE` dès qu'un épisode non gratuit est affiché.
