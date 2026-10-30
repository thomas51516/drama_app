# Contrat API v1.4 — sprint 6 (30 octobre 2026)

Complète les contrats précédents. Erreurs au format `ApiErrorDto`. Règles non négociables du cahier des charges §8.4 :
le serveur fait foi, grand livre `coin_ledger` seul support de toute variation (le solde est une projection),
idempotence par clé unique, débit et déblocage dans la même transaction.

## Portefeuille et déblocage (M-20, M-21, M-32, S07-BE-01 à 05)

`Wallet = { purchased, bonus, total, autoUnlock, bonusExpiring: [{ amount, expiresAt }] }`
`LedgerEntry = { id, amount (±), bucket: PURCHASED|BONUS, type: PURCHASE|BONUS|UNLOCK|ADJUSTMENT|EXPIRY|REFUND|MERGE, reference, description, expiresAt, createdAt }`

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /wallet` | | `Wallet` |
| `GET /wallet/transactions?page&pageSize&type` | | `{ items: LedgerEntry[], total, page, pageSize }` |
| `PATCH /me` | `{ autoUnlock?: boolean }` (champ ajouté) | `UserDto` |
| `POST /episodes/{id}/unlock` | `{ idempotencyKey }` (UUID client) | `200 { episodeId, method: "coins", charged: { bonus, purchased }, wallet }` ; déjà débloqué → `200 { method: <existant>, charged: {0,0} }` ; solde insuffisant → `402 INSUFFICIENT_COINS { details: { cost, balance } }` ; épisode gratuit → `200 method:"free"` |
| `GET /series/{id}/unlocks` | | `{ unlockedEpisodeIds: string[] }` |

- Coût = `series.coinCostPerEpisode` (surchargeable par épisode plus tard). Pièces bonus consommées avant les achetées, les bonus les plus proches de l'expiration d'abord.
- `POST /episodes/{id}/play` : si verrouillé et `user.autoUnlock` et solde suffisant → déblocage automatique dans la même requête (réponse `play` + `unlocked: true`) ; sinon `403 EPISODE_LOCKED { details: { coinCost, balance, canAutoUnlock } }`. Abonné VIP actif → toujours autorisé, `method: "vip"` enregistré dans `unlocks` sans débit.
- Le solde négatif (remboursement) bloque tout déblocage.

## Boutique et achats (M-30, M-31, S07-BE-06, S07-BE-07)

`Price = { currency: XOF|NGN|GHS|EUR|USD, amountMinor }`
`CoinPack = { id, sku, coins, bonusCoins, price: Price, badge?, position }` · `VipPlan = { id, sku, period: WEEK|MONTH|YEAR, price: Price, trialDays, badge? }`

| Méthode et route | Corps | Réponse |
| --- | --- | --- |
| `GET /shop` | en-tête `X-Country` | `{ currency, coinPacks: CoinPack[], vipPlans: VipPlan[], welcomeOffer: null }` (prix dans la devise du pays, repli USD) |
| `POST /billing/google/verify` | `{ purchaseToken, productId, type: "inapp"\|"subs", idempotencyKey }` | `200 { status: "credited"\|"already_processed"\|"subscription_active", wallet?, vip? }` ; jeton invalide → `400 PURCHASE_INVALID` ; jeton déjà consommé par un autre compte → `409 PURCHASE_OWNED_BY_OTHER` |
| `POST /webhooks/google-rtdn` | message Pub/Sub (`message.data` base64) | `204` (renouvellement, annulation, remboursement, pause) |
| `GET /me/subscription` | | `{ status: none\|active\|cancelled\|expired\|grace, plan, startedAt, expiresAt, autoRenew, store: "google" }` |

- Port `PurchaseVerifier` : `google` (Google Play Developer API, compte de service `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON|FILE`, package `GOOGLE_PLAY_PACKAGE_NAME`, acquittement après crédit) et `fake` (dev et tests uniquement, refusé en production : accepte `fake:<productId>:<nonce>`). `BILLING_VERIFIER=google|fake`.
- Le crédit d'un pack = une ligne PURCHASE (achetées) + une ligne BONUS (bonus, expiration `bonusValidityDays`). `purchases.token` unique garantit l'idempotence.
- RTDN : vérification du jeton d'abonnement auprès du vérificateur, mise à jour de `subscriptions` et de `users.vip_*` ; remboursement → ligne REFUND négative sur le portefeuille (pack) ou fin du VIP.

## Back-office — Monétisation (B-06) et récompenses (B-08)

Rôles MONETIZATION et ADMIN ; tout est audité.

| Méthode et route | Corps / réponse |
| --- | --- |
| `GET /admin/monetization/settings` · `PUT` | `{ defaultFreeEpisodes, defaultCoinCost, seriesUnlockDiscountPercent, adDailyCap, autoUnlockDefault, bonusValidityDays }` |
| `GET /admin/monetization/packs` · `POST` · `PATCH /{id}` · `DELETE` · `PUT /order` | `CoinPackAdmin = CoinPack + { prices: Price[], isActive, createdAt }` (`sku` = identifiant produit Play Console, immuable après création) |
| `GET /admin/monetization/vip-plans` · `POST` · `PATCH /{id}` · `DELETE` | `VipPlanAdmin = VipPlan + { prices: Price[], isActive }` |
| `GET /admin/rewards/checkin` · `PUT` | `{ days: [7 entiers], resetOnMiss: boolean }` (barème M-40, consommé au sprint 8) |

## Back-office — Utilisateurs (B-09, avancé du sprint 8)

Rôles SUPPORT et ADMIN (crédit/débit : ADMIN et SUPPORT, journalisé avec motif obligatoire).

| Méthode et route | Réponse |
| --- | --- |
| `GET /admin/users?q&page&pageSize` (id, e-mail, téléphone, nom) | `{ items: AdminUserSummary[], total, ... }` |
| `GET /admin/users/{id}` | `{ user: UserDto, wallet: Wallet, subscription, unlocks: [{ episodeId, seriesTitle, episodeNumber, method, at }], purchases: [...], recentLedger: LedgerEntry[], devices: n, lastSeenAt }` |
| `POST /admin/users/{id}/coins` `{ amount (±), bucket, reason }` | `Wallet` (ligne ADJUSTMENT, audit avec motif) |
| `POST /admin/users/{id}/block` · `/unblock` `{ reason }` | `UserDto` (jetons révoqués au blocage) |

## Appareil de confiance

`TrustedDevice` gagne `current: boolean` (appareil de la session courante).

## Défauts de recette à corriger (docs/recette/defauts.md)

DEF-002 recherche par genre sans `q` ; DEF-003 `PUT /progress` refusé (403) sur épisode verrouillé ; DEF-004 `/play` applique le territoire comme `/series` ; DEF-005 message clair sur code TOTP incomplet (web) ; DEF-006 l'app informe l'utilisateur quand une session invalide est remplacée (Android) ; DEF-008/009 validation de `cursor` et `X-Country`, code `VALIDATION_ERROR` homogène.
