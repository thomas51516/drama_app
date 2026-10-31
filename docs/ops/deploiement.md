# Déploiement en production — runbook (S10-OPS)

Cahier des charges §12. **Ce document et les gabarits qu'il décrit (`infra/docker-compose.prod.yml`,
`infra/traefik/`, `infra/.env.prod.example`) n'ont jamais tourné contre un vrai hébergeur, un vrai
domaine ni un vrai certificat — il n'existe aucun des trois pendant ce sprint.** Ce qui a réellement
été vérifié : la syntaxe du compose (`docker compose config`), et l'image `backend/Dockerfile`
construite et démarrée avec succès en local contre les PostgreSQL/Redis de développement (voir
§6). Le premier déploiement réel doit revérifier chaque point du §7 avant d'y faire confiance.

## 1. Portée

Ce runbook couvre l'API (`backend/`). **Le back-office et le site de recharge (`web/`) ne sont pas
couverts ici** (hors périmètre de ce ticket, qui ne touche que `backend/`, `infra/`, `docs/`) : ils
ont leur propre pipeline (`web-ci.yml`) et leur propre choix d'hébergement à faire séparément
(site Nuxt : hébergement statique/SSR type Vercel/Netlify, ou son propre conteneur derrière le
même Traefik — à documenter quand ce choix sera fait).

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
