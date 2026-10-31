# Déploiement en production — runbook (S10-OPS)

Cahier des charges §12. **Premier déploiement réel effectué le 2026-10-31** sur un VPS OVH partagé
avec un autre site (voir §9) : `https://dramanye.odootogo.com` répond (API + PostgreSQL + Redis +
MinIO auto-hébergés, voir §9 pour le gabarit utilisé), certificat Let's Encrypt réel obtenu via le
nginx système déjà présent sur l'hôte (pas Traefik — §9), parcours fonctionnel minimal vérifié
(invité → accueil avec contenu réel). **Ce n'est pas encore un vrai lancement commercial** :
`BILLING_VERIFIER`/`AD_PROVIDER`/`MOBILE_MONEY_PROVIDER` restent `fake` (aucun compte CinetPay/
Google Play/AdMob réel pour l'instant), ce qui impose `NODE_ENV=development` (seul moyen que
`env.schema.ts` autorise ces `fake`) — à revoir dès que ces comptes existent (§9, dernière section).

`infra/docker-compose.prod.yml` (Traefik + services managés externes) reste un gabarit non testé
contre un hébergeur dédié : syntaxiquement validé et l'image testée en local (§6), mais jamais
utilisé en vrai — voir §9 pour la variante auto-hébergée qui, elle, a tourné.

## 1. Portée

Ce runbook couvrait à l'origine seulement l'API (`backend/`) ; le choix d'hébergement du
back-office et du site de recharge a été fait et déployé le 2026-10-31 sur le même hôte (§9) —
pas sur un service type Vercel/Netlify.

## 2. Prérequis avant le premier déploiement

- **Domaine** : un nom de domaine (ou sous-domaine) pour l'API, ex. `api.drama.example`.
- **DNS** : un enregistrement `A` (et `AAAA` si IPv6) pointant ce domaine vers l'IP publique de
  l'hôte, propagé avant de lancer Traefik (Let's Encrypt doit pouvoir résoudre le domaine et
  joindre le port 80 de l'hôte pour le défi HTTP-01).
- **Hôte** : un serveur Linux avec Docker + Docker Compose v2, les ports 80 et 443 ouverts et
  libres (cahier des charges §12 : VPS Hetzner/OVH/Contabo ou cloud AWS/GCP). Dimensionnement de
  départ raisonnable : 2 vCPU / 4 Go de RAM suffisent largement pour l'API seule (le test de charge
  `docs/ops/charge.md` montre un process Node qui ne sature jamais le CPU sur un PC de dev, même
  sous forte charge — le goulot était la base de données, pas l'API).
- **Base de données** : PostgreSQL 16 managé (Supabase, Neon, RDS, DigitalOcean Managed DB…) avec
  sauvegardes automatiques + PITR activés chez le fournisseur. **Alternative auto-hébergée** si
  aucun service managé n'est budgété : un conteneur `postgres:16-alpine` sur le même hôte (reprendre
  la définition du service `postgres` de `infra/docker-compose.dev.yml`, avec un mot de passe fort
  et un volume sur un disque sauvegardé), plus `infra/scripts/backup.sh` en tâche planifiée (cron)
  vers un stockage objet **séparé** de l'hôte — voir `docs/ops/reprise.md` §6. Ce choix assume
  toute la responsabilité de la disponibilité et des sauvegardes normalement portée par le
  fournisseur managé ; à ne retenir que si le budget l'impose vraiment.
- **Redis** managé (Upstash, Redis Cloud…) ou, à défaut, un conteneur Redis dédié sur le même hôte
  (jamais partagé avec un autre projet : sert le cache catalogue, la limitation de débit et les
  files BullMQ — une purge accidentelle par un autre usage impacterait l'API).
- **Stockage objet + CDN** : un bucket S3 (AWS, R2 Cloudflare, Wasabi…) + un CDN devant lui
  (cahier des charges §9 : « la vidéo est servie par le CDN, pas par les serveurs applicatifs »).
  **Jamais MinIO en production** : pas de réplication, pas de durabilité garantie, pas fait pour
  être exposé publiquement — MinIO n'existe que pour le développement local
  (`infra/docker-compose.dev.yml`).
- **Transcodage vidéo** : un service géré (cahier des charges §9) qui notifie
  `POST /webhooks/transcode/{provider}` (`TRANSCODE_PROVIDER=webhook`), ou à défaut le service
  `worker` optionnel du compose (ffmpeg local, non recommandé en production, voir le commentaire
  dans `infra/docker-compose.prod.yml`).
- **Comptes tiers prêts** : compte de service Google Play (si `BILLING_VERIFIER=google`), identifiants
  CinetPay (si `MOBILE_MONEY_PROVIDER=cinetpay`), compte de service Firebase (si `PUSH_PROVIDER=fcm`),
  DSN Sentry (recommandé).
- **Secrets générés** à l'avance (`openssl rand -base64 48` pour chaque secret JWT/HMAC) et déposés
  dans le coffre choisi (§5), jamais dans un fichier du dépôt.

## 3. Premier déploiement, étape par étape

```bash
# Sur l'hôte, une fois Docker installé :
git clone <votre-dépôt> drama && cd drama

# 1. Remplir les secrets de production (jamais commités)
cp infra/.env.prod.example infra/.env.prod
nano infra/.env.prod   # DATABASE_URL, REDIS_URL, tous les secrets JWT/HMAC, API_DOMAIN, ACME_EMAIL…

# 2. Démarrage en une commande (construit l'image de l'API, lance les migrations, démarre
#    Traefik + l'API ; Traefik obtient son certificat Let's Encrypt au premier accès HTTPS)
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build

# 3. Vérifier que tout est en marche
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod ps
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod logs -f api
curl -s https://api.drama.example/health | jq   # "status": "ok", database et redis "up"

# 4. Semence initiale (une seule fois : comptes internes, boutique de pièces, VIP, FAQ)
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec api \
  node -e "require('child_process').execSync('npx prisma db seed', {stdio:'inherit'})"
# Alternative plus simple si `tsx` est disponible dans l'image (voir backend/Dockerfile) :
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec api npx prisma db seed
```

`prisma migrate deploy` tourne automatiquement au démarrage du conteneur `api` (`backend/Dockerfile`,
`CMD`) — pas d'étape manuelle à part pour les migrations.

**Après le tout premier déploiement**, changer immédiatement le mot de passe du compte admin créé
par le seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` dans `infra/.env.prod`) depuis le
back-office, puis enrôler le TOTP.

## 4. Mettre à jour vers une nouvelle version

```bash
cd drama && git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build api
```

`--build api` ne reconstruit et ne redémarre que le service `api` (Traefik continue de tourner,
aucune coupure TLS). Les migrations Prisma s'appliquent au redémarrage du conteneur, avant que le
nouveau code ne reçoive du trafic (le conteneur ne passe `healthy`, donc visible par Traefik, qu'une
fois `npx prisma migrate deploy` terminé et le serveur HTTP démarré).

**Avec plusieurs réplicas** (`docker compose … up -d --build --scale api=2`) : Prisma pose un
verrou de migration (`advisory lock` PostgreSQL) le temps d'appliquer le schéma, donc pas de
conflit entre réplicas qui démarrent en même temps.

**Registre d'images** (recommandé dès que plusieurs hôtes ou un vrai pipeline CI/CD existent) :
construire et pousser l'image depuis la CI (`docker build -t ghcr.io/<org>/drama-api:<tag>
-f backend/Dockerfile backend && docker push …`), puis sur l'hôte se contenter de
`API_IMAGE=ghcr.io/<org>/drama-api API_IMAGE_TAG=<tag> docker compose … pull && … up -d` sans
reconstruire sur la machine de production elle-même.

## 5. Retour en arrière (rollback)

- **Code applicatif** : redéployer l'image/le commit précédent —
  `API_IMAGE_TAG=<tag-précédent> docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d api`
  (ou `git checkout <commit-précédent>` puis `--build` si pas de registre d'images).
- **Migration de schéma** : Prisma n'a pas de "rollback" automatique de migration. Si la nouvelle
  migration casse quelque chose : écrire une migration *correctrice* (jamais modifier une migration
  déjà appliquée, règle du projet — `backend/CLAUDE.md`) plutôt que redéployer un ancien code sur un
  schéma plus récent (le code ancien ne connaît pas forcément les nouvelles colonnes, mais les
  migrations Prisma sont conçues pour être additives et rétrocompatibles le temps du déploiement ;
  vérifier au cas par cas).
- **Cas grave** (données corrompues) : voir `docs/ops/reprise.md` (restauration depuis une
  sauvegarde, jamais en écrasant `drama` sans passer par une base jetable de vérification d'abord).

## 6. Ce qui a été vérifié pendant ce sprint (preuve, pas juste affirmation)

```
$ docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod config --services
api
traefik
$ docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod --profile worker config --services
api
traefik
worker
```

Image construite et démarrée réellement (contre les PostgreSQL/Redis de dev, `NODE_ENV=production`,
`BILLING_VERIFIER=google`, `AD_PROVIDER=admob`, `MOBILE_MONEY_PROVIDER=cinetpay`, `SWAGGER_ENABLED=false`) :

```
$ docker build -t drama-api:test -f backend/Dockerfile backend   # succès
$ docker run -d --network host -e NODE_ENV=production … drama-api:test
$ curl -s localhost:3999/health
{"status":"ok","checks":{"database":{"status":"up"},"redis":{"status":"up"}}}
$ docker inspect --format='{{.State.Health.Status}}' drama-api-prodtest
healthy
```

**Pas vérifié, et ne pouvant pas l'être sans hébergeur réel** : Traefik devant un vrai domaine,
l'obtention effective d'un certificat Let's Encrypt, le comportement derrière un vrai Cloudflare,
le redémarrage après un vrai `reboot` de l'hôte, le comportement à plusieurs réplicas sous trafic
réel, la rotation de secrets en marche.

## 7. À revérifier au tout premier déploiement réel

1. `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod config` ne doit
   renvoyer aucune variable vide pour un champ obligatoire (`DATABASE_URL`, les secrets JWT/HMAC,
   `API_DOMAIN`, `ACME_EMAIL`…) — relire `infra/.env.prod` entièrement avant `up`.
2. DNS propagé (`dig +short api.drama.example` renvoie bien l'IP de l'hôte) **avant** de démarrer
   Traefik, sinon le défi Let's Encrypt échoue et il faut relancer `docker compose … restart traefik`
   après correction.
3. `docker compose … logs traefik` après le premier démarrage : confirmer l'obtention du certificat
   (pas d'erreur ACME), puis `curl -vI https://api.drama.example/health` pour voir la chaîne de
   certificat.
4. `curl -sI https://api.drama.example/health | grep -i strict-transport-security` : l'en-tête HSTS
   doit apparaître (posé par l'API elle-même, voir `docs/ops/securite.md` §5) — s'il n'apparaît pas,
   quelque chose dans la chaîne TLS/proxy l'a filtré.
5. Confirmer qu'aucun service `/metrics` n'est exposé publiquement
   (`curl -s https://api.drama.example/metrics` doit échouer : pas de routeur Traefik pour ce
   chemin, voir le commentaire dans `docker-compose.prod.yml`).
6. Vérifier que `GOOGLE_RTDN_AUTH_TOKEN`, et tous les secrets `*_SECRET`/`*_KEY`, sont bien des
   valeurs générées pour CET environnement (jamais recopiées de dev/recette).
7. Lancer un parcours fonctionnel minimal réel (compte invité → accueil → lecture d'un épisode)
   contre le domaine de production avant d'annoncer le lancement.
8. Planifier le vrai test d'intrusion (cahier des charges §12) maintenant qu'un environnement
   accessible depuis l'extérieur existe — voir `docs/ops/securite.md`, conclusion.
9. Mettre en place la supervision (adapter `infra/docker-compose.monitoring.yml` pour scraper le
   conteneur `api` de cette pile plutôt que l'hôte de dev, ou pointer Prometheus vers
   `METRICS_TOKEN` protégé) et Cloudflare devant l'API (cahier des charges §12 : anti-DDoS/WAF) —
   non inclus dans ce gabarit, à ajouter une fois le domaine réel choisi.

## 8. D'où viennent les secrets

**Jamais dans le dépôt.** `infra/.env.prod` est ignoré par git (`.gitignore` racine : `.env*`) et ne
doit exister que sur l'hôte de production (droits restreints, `chmod 600`) ou dans le gestionnaire
de secrets choisi :
- **GitHub Actions secrets** (`Settings → Secrets and variables → Actions`) si le déploiement est
  automatisé depuis la CI (voir la revue CI/CD, §9 du ticket sprint 8) — jamais en clair dans un
  fichier de workflow.
- **Un vrai coffre** (HashiCorp Vault, Doppler, AWS/GCP Secrets Manager…) si l'équipe grandit —
  non mis en place pendant ce sprint (pas d'infrastructure à laquelle le connecter encore), mais
  `infra/.env.prod` est conçu pour être généré *depuis* un tel coffre plutôt que maintenu à la main
  dès que ce sera pertinent (`vault kv get -format=json secret/drama/prod | … > infra/.env.prod`
  ou équivalent selon l'outil retenu).
- Rotation : un secret compromis ou simplement ancien se change dans le coffre puis se redéploie
  (`docker compose … up -d api` relit `infra/.env.prod` à chaque démarrage, pas de cache).

## 9. Déploiement réel du 2026-10-31 (VPS partagé, auto-hébergé)

L'hôte disponible (`vps-7e2894cc.vps.ovh.ca`, Ubuntu 26.04, 4 vCPU/7.6 Go) héberge déjà un autre
site client (ERP Odoo) via un nginx système + certbot sur les ports 80/443 — ce n'est pas un hôte
dédié. Conséquences sur le gabarit :

- **`infra/docker-compose.prod.selfhosted.yml`** (nouveau fichier, variante auto-hébergée de
  `docker-compose.prod.yml`) remplace Traefik : PostgreSQL, Redis et MinIO tournent dans cette pile,
  publiés uniquement sur `127.0.0.1` (jamais `0.0.0.0`) ; c'est le nginx système existant qui fait la
  terminaison TLS et le reverse proxy, exactement comme pour l'autre site de l'hôte. Deux vhosts
  ajoutés sans toucher à la config existante : `dramanye-api.conf` (→ `127.0.0.1:3001`) et
  `dramanye-media.conf` (→ `127.0.0.1:9000`, MinIO), chacun avec son certificat Let's Encrypt
  (`certbot --nginx -d <domaine>`).
- **MinIO reste le stockage** (aucun budget S3/CDN réel pour l'instant) : `S3_ENDPOINT` et
  `CDN_BASE_URL` pointent tous les deux sur `https://media.dramanye.odootogo.com` (nginx devant
  MinIO), jamais sur le nom de service Docker interne — `presignPut`/`presignGet` signent des URLs
  avec l'hôte de `S3_ENDPOINT`, qui doit donc être joignable par le navigateur de l'uploadeur.
  `extra_hosts` épingle ce domaine sur l'IP publique de l'hôte dans le conteneur `api`, pour ne pas
  dépendre du hairpin NAT du VPS.
- **Deux bugs trouvés et corrigés dans `backend/Dockerfile` à cette occasion** (jamais détectés avant
  faute d'avoir réellement construit puis *utilisé* l'image contre une vraie base) :
  1. Pas de `ffmpeg`/`ffprobe` dans l'image runtime → `TRANSCODE_PROVIDER=local` (aucun prestataire
     de transcodage géré pour l'instant) aurait échoué au premier épisode envoyé. Ajout de
     `RUN apk add --no-cache ffmpeg` dans l'étape `runtime`.
  2. `prisma db seed` (exécuté via `tsx`, pas le code compilé) importe le client généré depuis
     `src/generated/prisma/`, jamais copié dans l'image runtime (seul `dist/` l'était) → échec
     `ERR_MODULE_NOT_FOUND` au premier `prisma db seed`. Ajout de
     `COPY --from=build /app/src/generated ./src/generated`.
- **`BILLING_VERIFIER=fake` / `AD_PROVIDER=fake` / `MOBILE_MONEY_PROVIDER=fake`** (aucun compte réel
  CinetPay/Google Play/AdMob) → `NODE_ENV=development` (seule valeur que `env.schema.ts` autorise
  avec ces `fake`), `SENTRY_ENVIRONMENT=staging` pour que ça reste visible que ce n'est pas un vrai
  lancement. `PUSH_PROVIDER=log` et `SMS_PROVIDER=console` pour la même raison (pas de compte
  Firebase/SMS réel). **À revoir dès qu'un de ces comptes existe** : changer la seule variable
  concernée dans `infra/.env.prod` sur l'hôte et redéployer (§4) — rien d'autre à changer.
- Vérifié en conditions réelles (pas seulement en local) : certificat Let's Encrypt obtenu pour les
  deux domaines, en-tête HSTS présent, `/metrics` renvoie 404 publiquement, ports PostgreSQL/Redis/
  API/MinIO fermés depuis l'extérieur (seuls 80/443 ouverts), parcours invité → accueil fonctionnel
  avec le contenu du seed, fichier déposé dans le bucket effectivement servi en HTTPS public.
- **Pas encore fait** : contenu réel (les épisodes déjà ingérés en local, ex. « La Nounou », ne sont
  pas sur cet hôte — seul le contenu du seed y est) ; sauvegardes `postgres-backups` copiées hors de
  cet hôte (tournent déjà en local au volume, voir l'avertissement dans
  `docker-compose.prod.selfhosted.yml`) ; supervision (§7.9) ; test d'intrusion (§7.8).

### Back-office et site de recharge (`web/`, 2026-10-31)

Déployés sur le même hôte, chacun son sous-domaine et son certificat Let's Encrypt :

- **Back-office** (`web/apps/admin`, `ssr: false`) : export **statique** (`npm run generate`, pas
  `build` — `build` seul ne produit pas de `index.html` prérendu, voir le commentaire Nitro
  « HTML content not prerendered because ssr: false »), copié dans `/var/www/dramanye-admin` sur
  l'hôte. Servi directement par le nginx système (`dramanye-admin.conf`, `try_files … /index.html`
  pour les routes dynamiques type `/users/<id>`) — **aucun conteneur, aucun processus Node** pour ce
  site : les variables `NUXT_PUBLIC_*` sont figées dans le JS au moment du `generate`, donc tout
  changement de configuration (URL d'API, etc.) demande de relancer `generate` et de recopier
  `.output/public/`.
- **Site de recharge** (`web/apps/recharge`, `ssr: true`) : tourne en continu (rendu serveur Nitro),
  conteneurisé (`web/apps/recharge/Dockerfile`, nouveau fichier, build depuis la racine `web/` pour
  les workspaces npm) et ajouté au même `infra/docker-compose.prod.selfhosted.yml` que l'API
  (service `web-recharge`, publié seulement sur `127.0.0.1:3002`, nginx fait la terminaison TLS).
  Contrairement au back-office statique, ses `NUXT_PUBLIC_*` sont lus par le serveur à chaque requête
  (pas figés au build) : un changement de configuration ne demande qu'un redémarrage du conteneur
  (`docker compose … up -d web-recharge`), pas une reconstruction.
- **Bug de lockfile trouvé en construisant l'image** (`web/apps/recharge/Dockerfile`) : `npm ci`
  échoue avec `node:24-alpine` (npm embarqué plus récent que celui qui a généré
  `web/package-lock.json`, résolution différente de dépendances optionnelles comme `@emnapi/core`)
  → le Dockerfile épingle `npm install -g npm@11.6.2` avant `npm ci`. Si `web/package-lock.json` est
  régénéré avec un npm plus récent, remonter cette version épinglée en conséquence (ou le constater
  à nouveau en reconstruisant l'image).
- `infra/.env.prod` a deux variables de plus : `RECHARGE_API_BASE` (= `API_DOMAIN` public) et
  `TOPUP_RETURN_URL` mis à jour vers `https://recharge.dramanye.odootogo.com/retour` (était vide
  avant que ce site existe).
- Vérifié : les trois domaines répondent en HTTPS, le port interne du site de recharge (3002) est
  fermé depuis l'extérieur, le repli SPA du back-office fonctionne sur une route dynamique non
  prérendue.
