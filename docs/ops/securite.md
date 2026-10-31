# Audit de sécurité — autodiagnostic (sprint 8)

Cahier des charges §12. **Ceci est une auto-revue outillée par l'équipe elle-même, pas un test
d'intrusion.** Elle trouve et corrige ce qu'une revue de code disciplinée peut trouver (limites de
débit manquantes, vérifications de signature, hygiène des secrets, en-têtes HTTP) ; elle ne
remplace pas un prestataire externe qui essaiera activement de casser le système (fuzzing,
chaînage de vulnérabilités, ingénierie sociale, tests sur une instance réellement exposée à
Internet). **Le cahier des charges exige un vrai test d'intrusion avant lancement ; cette revue ne
le rend pas inutile, elle réduit juste le nombre de choses évidentes qu'il trouverait.**

## 1. Limitation de débit — couverture par route sensible

Preuve : `grep -rn "@RateLimit(" src --include="*.controller.ts"` avant intervention listait
seulement 9 décorateurs, tous dans `auth.controller.ts`, `admin-auth.controller.ts` et
`analytics.controller.ts`. Les routes suivantes, explicitement signalées par le ticket, n'avaient
**aucune** limite :

| Route | Avant | Trouvé par | Après |
| --- | --- | --- | --- |
| `POST /episodes/:id/unlock` | ❌ aucune limite | `grep` sur `unlock.controller.ts` : pas de `@RateLimit` | ✅ `episode_unlock`, 30/IP/15 min (`src/unlock/unlock.controller.ts:40-44`) |
| `POST /series/:id/unlock-all` | ❌ aucune limite | idem | ✅ `series_unlock_all`, 30/IP/15 min (`src/unlock/unlock.controller.ts:103-106`) |
| `POST /ads/sessions` | ❌ aucune limite | `grep` sur `ads.controller.ts` | ✅ `ads_sessions`, 20/IP/15 min (`src/ads/ads.controller.ts:77-80`) |
| `POST /promo/redeem` | ❌ aucune limite — **le plus sérieux : un code promo court est bruteforçable sans ça** | `grep` sur `offers.controller.ts` | ✅ `promo_redeem`, 10/IP/15 min (`src/offers/offers.controller.ts:36-39`) |
| `POST /topup/orders` | ❌ aucune limite | `grep` sur `topup.controller.ts` | ✅ `topup_orders`, 20/IP/15 min (`src/topup/topup.controller.ts:51-55`) |

Routes déjà correctement limitées (pour mémoire, non touchées) : `/auth/guest` (30/IP/15 min),
`/auth/refresh` (120/IP/15 min), `/auth/google` (30/IP/15 min), `/auth/otp/request` (3/numéro et
10/IP/15 min), `/auth/otp/verify` (20/IP/15 min), `/auth/email/register` (10/IP/15 min),
`/auth/email/login` (10/e-mail et 30/IP/15 min), `/admin/auth/login` (5/e-mail et 20/IP/15 min),
`/admin/auth/totp/verify` (30/IP/15 min), `POST /events` (120/IP/min), `POST /help/contact`
(5/utilisateur/jour, compteur Redis applicatif plutôt que `@RateLimit` — `SUPPORT_CONTACT_DAILY_LIMIT`).

**Routes volontairement non limitées par IP, avec leur propre protection** : les trois webhooks
(`/webhooks/google-rtdn`, `/webhooks/mobile-money/:provider`, `/webhooks/transcode/:provider`) ne
portent pas de `@RateLimit` — une limite par IP serait inutile (l'agrégateur/Google/Mux appelle
depuis des IP variables côté fournisseur) et c'est la vérification de signature (§2) qui protège
contre l'abus, pas un compteur par IP.

**Correctifs appliqués** : `backend/src/unlock/unlock.controller.ts`,
`backend/src/ads/ads.controller.ts`, `backend/src/offers/offers.controller.ts`,
`backend/src/topup/topup.controller.ts`. Toutes les routes `/admin/*` sensibles restantes
(séries, épisodes, comptes) sont protégées par l'authentification 2FA obligatoire plutôt que par
du débit — un back-office n'a pas le même profil d'attaque qu'une route publique.

Vérifié : `npm run lint && npm run build && npm test && npm run test:e2e` verts après ajout (251
tests unitaires, 54 e2e — les specs e2e réinitialisent déjà les clés `rl:*` dans `beforeAll`,
aucun test n'a eu besoin d'être modifié).

## 2. Vérification des signatures de webhooks

| Webhook | Fichier | Mécanisme | Obligatoire ? |
| --- | --- | --- | --- |
| `POST /webhooks/transcode/:provider` | `src/transcode/webhook/transcode-webhook.controller.ts` + `webhook-signature.ts` | HMAC-SHA256 du corps brut (+ horodatage optionnel, tolérance ±5 min contre le replay), comparaison à temps constant (`timingSafeEqual`) | **Oui** : `503 WEBHOOK_NOT_CONFIGURED` si `TRANSCODE_WEBHOOK_SECRET` absent (`transcode-webhook.controller.ts:66-70`) |
| `POST /webhooks/mobile-money/:provider` (`fake`) | `src/topup/provider/fake-mobile-money.provider.ts` | `X-Fake-Signature: sha256=HMAC-SHA256(MOBILE_MONEY_FAKE_SECRET, corps brut)`, `timingSafeEqual` (lignes 42-67) | Oui, et `MOBILE_MONEY_PROVIDER=fake` est refusé en production (`env.schema.ts:192-197`) |
| `POST /webhooks/mobile-money/:provider` (`cinetpay`) | `src/topup/provider/cinetpay-mobile-money.provider.ts` | `x-token` = HMAC-SHA256(`CINETPAY_SECRET`, champs `cpm_*` concaténés), `timingSafeEqual` (lignes 103-138), **puis** confirmation serveur à serveur `POST /v2/payment/check` avant de créditer (défense en profondeur : la signature seule ne suffit pas, le montant/statut est revérifié auprès de l'agrégateur) | Oui si `MOBILE_MONEY_PROVIDER=cinetpay` (clés requises, `env.schema.ts:199-204`) |
| `POST /webhooks/google-rtdn` | `src/billing/billing.service.ts::handleGoogleRtdn` | Jeton partagé statique (`?token=` ou `Authorization: Bearer`) comparé contre `GOOGLE_RTDN_AUTH_TOKEN` | **Trouvé non obligatoire** avant correction — voir ci-dessous |
| `GET/POST /ads/reward` (callback SSV régie) | `src/ads/ssv/fake-ad-ssv.verifier.ts` (dev) / `admob-ad-ssv.verifier.ts` (prod) | `fake` : HMAC-SHA256 + `timingSafeEqual` ; `admob` : signature **ECDSA P-256** vérifiée avec les clés publiques Google (`ADMOB_SSV_KEYS_URL`, cache 24 h, `node:crypto` `verify()`) | Oui, et `AD_PROVIDER=fake` refusé en production (`env.schema.ts:185-191`) |

### Gap trouvé et corrigé : RTDN Google sans vérification obligatoire en production

`handleGoogleRtdn` (`src/billing/billing.service.ts:295-302`) ne contrôlait le jeton **que si**
`GOOGLE_RTDN_AUTH_TOKEN` était défini — et rien dans `env.schema.ts` n'imposait de le définir en
production, à la différence de `BILLING_VERIFIER`, `AD_PROVIDER` et `MOBILE_MONEY_PROVIDER` qui
ont chacun une règle « refusé en production ». Concrètement : avec `BILLING_VERIFIER=google` (le
seul mode autorisé en production) et `GOOGLE_RTDN_AUTH_TOKEN` laissé vide, `POST
/webhooks/google-rtdn` acceptait n'importe quel appel sans aucun contrôle d'authenticité — un
tiers connaissant (ou ayant deviné/récupéré) un `purchaseToken` existant aurait pu déclencher un
remboursement (lignes `REFUND` négatives dans le grand livre) ou forcer une resynchronisation
d'abonnement pour ce compte.

**Corrections appliquées** :
1. `src/config/env.schema.ts` : nouvelle règle, `GOOGLE_RTDN_AUTH_TOKEN` est désormais **obligatoire**
   quand `NODE_ENV=production` (l'application refuse de démarrer sinon).
2. `src/billing/billing.service.ts` : comparaison du jeton passée de `!==` à une comparaison à
   temps constant (`timingSafeEqual`, fonction `safeTokenEquals`), même précaution que les autres
   webhooks du projet.

**Non corrigé, signalé pour une passe dédiée** : un jeton partagé statique reste plus faible que
la vérification recommandée par Google pour Pub/Sub push (jeton OIDC signé par Google avec
audience vérifiée) — suffisant pour le MVP (le jeton est un secret long généré par
`openssl rand`, jamais exposé côté client), mais à durcir si ce flux devient critique.

## 3. Hygiène des secrets

- `.gitignore` racine et `backend/.gitignore` excluent `.env` et `.env.*`, avec `!.env.example`
  explicitement blanchi (`.gitignore:10-12`, `backend/.gitignore:11-13`). Aucun fichier `.env` réel
  n'est suivi par git : `git ls-files | grep -E "\.env$|\.env\."` → seuls des `*.env.example`.
- Recherche de secrets committés sur tout le dépôt suivi (clés AWS, clés privées PEM, clés Stripe,
  clés Google API) : `git grep -nIE "AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY-----|sk_live_|pk_live_|AIza[0-9A-Za-z_-]{35}"` → **aucun résultat**.
- Recherche plus large (`secret|password|token|api[_-]?key` suivi d'une valeur de 20+ caractères) →
  seulement des fixtures de test explicitement fausses (`unit-test-webhook-secret-…`,
  `user-secret-0123456789…`) et les placeholders `.env.example` (`dev-only-…-change-me`,
  `ci-only-…`). Aucune valeur qui ressemble à un vrai secret.
- `backend/.env.example` : toutes les valeurs sont des placeholders explicitement nommés
  (`dev-only-…-change-me-…`) ou vides pour les champs sensibles non requis en dev
  (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `CINETPAY_SECRET`, …). `web/.env.example` : seulement des
  URL `localhost` et un `GOOGLE_CLIENT_ID` vide.
- Aucun `google-services.json`, `.jks`/`.p12`/`.pem`, ni fichier de compte de service suivi par git
  (`git ls-files | grep -iE "google-services|keystore|\.jks$|\.p12$|\.pem$|service-account"` →
  aucun résultat pertinent).
- `src/common/crypto/secret-box.ts` (AES-256-GCM) chiffre les secrets TOTP **en base** avec
  `TOTP_ENCRYPTION_KEY` — ils ne sont jamais stockés en clair, même côté serveur.

**Verdict : pas de secret committé trouvé.** Rappel pour la suite : en production, les secrets
viennent d'un coffre (CI secrets, Vault…) jamais du dépôt — voir `docs/ops/deploiement.md` §5.

## 4. Mots de passe et TOTP

- **Argon2id** partout où un mot de passe est haché : back-office
  (`src/admin/accounts/admin-accounts.service.ts:54,174`, `src/admin/auth/admin-auth.service.ts:66`)
  et comptes e-mail app (`src/auth/identity/identity-auth.service.ts:56,71`). Paramètres par défaut
  de la librairie `argon2` (type **argon2id** explicite, coût mémoire 64 Mio, coût temps 3,
  parallélisme 4) : au-dessus des recommandations minimales OWASP (19 Mio / 2 itérations), donc
  raisonnables sans réglage supplémentaire pour la volumétrie du MVP.
- **Protection par hachage factice** contre l'énumération de comptes par mesure de temps :
  `admin-auth.service.ts:59` précalcule un hachage Argon2id d'un UUID aléatoire au démarrage et le
  compare même quand le compte n'existe pas, pour que `email inconnu` et `mot de passe incorrect`
  prennent un temps similaire.
- **TOTP obligatoire sur le back-office, pas de contournement en production** :
  `admin-auth.service.ts` n'a aucune branche conditionnée par `NODE_ENV` qui court-circuite le TOTP
  (`grep -n "NODE_ENV" src/admin/auth/admin-auth.service.ts` → aucun résultat). Le flux est
  toujours : `totp_setup_required` (première connexion, QR code, secret chiffré en base) ou
  `totp_required` (connexions suivantes) ; aucun chemin ne renvoie directement un jeton d'accès
  sans TOTP sauf l'« appareil de confiance » (voir ci-dessous), qui est une fonctionnalité
  d'ergonomie documentée, pas un contournement de l'enrôlement.
- **Appareil de confiance (30 jours)** : jeton de 256 bits aléatoires
  (`randomBytes(32)`, `trusted-device.service.ts:66`), **stocké haché SHA-256** en base, jamais en
  clair, révocable (`DELETE /admin/auth/devices/{id}`, `POST /admin/accounts/{id}/revoke-devices`,
  révoqué automatiquement par une réinitialisation TOTP ou une désactivation de compte). Ne
  s'applique qu'à un compte où le TOTP est déjà enrôlé — ce n'est pas une voie pour éviter
  l'enrôlement initial.

**Verdict : OK, rien à corriger.**

## 5. En-têtes de sécurité HTTP (helmet)

Avant intervention, `src/app.setup.ts` ne personnalisait que `contentSecurityPolicy` (désactivée
quand Swagger est exposé, l'interface Swagger ayant besoin d'inline script/style que la CSP par
défaut de helmet bloquerait) et `crossOriginResourcePolicy`. Le reste des protections par défaut
de helmet s'appliquait déjà implicitement (`X-Content-Type-Options: nosniff`, `X-Frame-Options:
SAMEORIGIN`, HSTS avec les valeurs par défaut de la librairie) mais sans que ce soit explicite ni
documenté — et sans `preload`.

**Correctif appliqué** : `strictTransportSecurity` explicite dans `src/app.setup.ts`
(`maxAge: 31536000` soit 1 an, `includeSubDomains: true`, `preload: true`). Vérifié en direct :

```
$ curl -s -D - -o /dev/null localhost:3000/health | grep -i "strict-transport\|x-frame\|x-content-type"
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
```

**Important, et déjà noté dans le code** : cet en-tête n'a d'effet que servi par-dessus TLS — un
navigateur l'ignore en HTTP simple (le cas de ce PC de dev). Il ne devient réellement actif qu'une
fois le reverse proxy Traefik en place avec un vrai certificat (`infra/traefik/`,
`docs/ops/deploiement.md`). Avant d'activer `preload` pour de vrai (soumission à
hstspreload.org), s'assurer que **tous** les sous-domaines tournent bien en HTTPS — sinon ça les
casse de façon difficile à annuler (le préchargement reste en cache navigateur longtemps après
retrait de la liste).

## 6. Checklist façon OWASP API Security Top 10

| # | Risque | Verdict | Détail |
| --- | --- | --- | --- |
| API1 | Broken Object Level Authorization | ✅ OK | Chaque accès à une ressource repasse par le propriétaire (`userId` du jeton), jamais un id de ressource seul qui ferait confiance au client ; `EntitlementService` recalcule les droits serveur à chaque lecture/déblocage. |
| API2 | Broken Authentication | ✅ OK | JWT utilisateur/admin séparés (secrets et `aud` différents, §1 `backend/CLAUDE.md`), rotation + détection de réutilisation du refresh token, TOTP obligatoire back-office (§4). |
| API3 | Broken Object Property Level Authorization | ✅ OK | DTO stricts (`class-validator`, `whitelist + forbidNonWhitelisted`), champs de monétisation des séries restreints aux rôles MONETIZATION/ADMIN (`403 FORBIDDEN_FIELDS`). |
| API4 | Unrestricted Resource Consumption | ⚠️ Gap trouvé et corrigé | Les 5 routes du §1 n'avaient pas de limite de débit — corrigé. `PUSH_DAILY_CAP`, plafond quotidien de pub récompensée et de check-in déjà en place. Reste un gap volontairement non traité : pas de quota global par compte sur `POST /episodes/{id}/unlock` au-delà du débit par IP (le coût réel est porté par le solde du portefeuille, qui est la vraie limite). |
| API5 | Broken Function Level Authorization | ✅ OK | `@AdminRoute()` + `AdminAuthGuard` + `@Roles()` sur toutes les routes `/admin/*`, jamais de JWT utilisateur accepté côté admin ni l'inverse (vérifié par le `typ`/`aud` du jeton). |
| API6 | Unrestricted Access to Sensitive Business Flows | ✅ OK pour l'essentiel | Déblocage, achat et recharge passent tous par une transaction serveur avec idempotence ; §1 ferme le dernier gap de débit sur ces flux. |
| API7 | Server Side Request Forgery | ✅ OK | Aucune route n'accepte une URL arbitraire à récupérer côté serveur ; les intégrations sortantes (Google, CinetPay, AdMob) ciblent des hôtes fixes configurés par variable d'environnement, jamais fournis par la requête cliente. |
| API8 | Security Misconfiguration | ⚠️ Gap trouvé et corrigé | HSTS implicite rendu explicite (§5) ; `GOOGLE_RTDN_AUTH_TOKEN` rendu obligatoire en production (§2). CORS : `CORS_ORIGINS=*` reste possible si mal configuré en production (voir `docs/ops/deploiement.md`, à verrouiller à la vraie liste d'origines au déploiement — risque limité ici car l'API s'authentifie par en-tête `Authorization`, pas par cookie, donc pas de vol de session via CORS seul). |
| API9 | Improper Inventory Management | ✅ OK | Un seul OpenAPI v1 maintenu et vérifié en CI (`docs/api/openapi.v1.json`), endpoints non implémentés explicitement documentés `501` plutôt que silencieusement absents. |
| API10 | Unsafe Consumption of APIs | ✅ OK | Toutes les réponses externes (Google Play, CinetPay, AdMob) sont vérifiées par signature et/ou rappel serveur à serveur avant d'avoir un effet (§2) ; aucune confiance aveugle dans un webhook. |

## 7. Ce qu'une auto-revue ne peut pas remplacer

- Elle ne teste pas une instance réellement exposée à Internet (pas de scan de ports, pas de test
  de contournement du reverse proxy, pas de test DDoS/WAF — rien de tout ça n'existe encore en
  dev).
- Elle ne fait pas de fuzzing systématique des DTO, ni de tentative de chaînage de plusieurs failles
  mineures en une faille sérieuse — c'est le travail d'un testeur qui pousse activement là où le
  code a l'air solide.
- Elle ne couvre pas l'ingénierie sociale, le phishing du support, ni la sécurité physique.
- Elle est écrite par l'équipe qui a construit le système : un biais de confirmation est
  inévitable malgré les preuves citées (sorties de commandes, pas seulement des affirmations).

**Conclusion : cette revue a trouvé et corrigé cinq routes sans limitation de débit (dont une,
`POST /promo/redeem`, bruteforçable) et un webhook de paiement sans vérification obligatoire en
production — deux catégories de bogues réels, pas cosmétiques. Elle confirme que les signatures de
webhooks, le hachage des mots de passe, le TOTP obligatoire et l'absence de secret committé sont
dans un état sain. Elle ne remplace pas, et le cahier des charges l'exige explicitement, un vrai
test d'intrusion par un prestataire externe avant le lancement — à planifier une fois un
environnement de recette accessible depuis l'extérieur existe (voir `docs/ops/deploiement.md`).**
