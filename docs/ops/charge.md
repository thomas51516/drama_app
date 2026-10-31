# Test de charge — S10-OPS-01

Cahier des charges §12 : « temps de réponse API p95 < 300 ms sur les endpoints de lecture » et
« tenue de charge validée à 5 000 utilisateurs simultanés avant lancement ».

**Verdict honnête en une phrase : ce test valide le p95 < 300 ms jusqu'à ~400 utilisateurs
virtuels sur CE PC de développement, avec zéro erreur jusqu'à 800 ; il ne valide PAS, et ne peut
pas valider, les 5 000 utilisateurs simultanés du cahier des charges — cela demande du matériel de
recette (staging), pas un PC partagé avec un navigateur, deux serveurs de dev et un conteneur
Postgres unique.**

## 1. Méthodologie

- Outil : [k6](https://k6.io) (image Docker officielle `grafana/k6`, aucune installation système).
- Cible : l'API de dev en marche sur `http://localhost:3000` (`npm run dev`, PostgreSQL/Redis/MinIO
  via `docker compose -f infra/docker-compose.dev.yml`), données réelles du propriétaire produit
  (série « La Nounou », 2 épisodes publiés, et « Le Secret du Lagon ») — **jamais modifiées** par
  le test (uniquement des `GET` et un `POST /episodes/{id}/play` sur un épisode déjà gratuit).
- Endpoints couverts (ceux cités par le cahier des charges) : `GET /home`, `GET /series/{id}`,
  `GET /series/{id}/episodes`, `POST /episodes/{id}/play`, `GET /feed`, `GET /search`.
- Script : `infra/loadtest/read-heavy.js`. Chaque itération d'utilisateur virtuel (VU) appelle les
  six endpoints dans l'ordre avec un `sleep(0.2–0.5)` entre chaque appel (lecture d'écran simulée),
  `X-Country: TG` et un jeton d'accès valide pris au hasard dans un pool.
- Authentification : `/auth/guest` est volontairement **contourné** pour fabriquer les comptes de
  test — il est limité à 30 requêtes / IP / 15 min (`auth_guest` rate limit), ce qui n'a rien à voir
  avec ce qu'on mesure ici et aurait faussé le test avec des `429`. À la place,
  `backend/scripts/loadtest-seed-users.ts` crée directement en base N utilisateurs `GUEST` jetables
  (`device_id LIKE 'k6-loadtest-%'`) et signe pour chacun un jeton d'accès valide avec le même
  secret que l'API (`JWT_ACCESS_SECRET`, format identique à `AccessTokenPayload`). Ces comptes sont
  supprimés après chaque campagne de mesure (`npx tsx scripts/loadtest-seed-users.ts --cleanup`) ;
  aucun compte réel, aucune série réelle n'est touché. 300 jetons ont suffi (réutilisés au hasard
  par les VU : des GET authentifiés ne nécessitent pas un utilisateur unique par VU pour mesurer le
  coût serveur).
- Paliers : 10, 100, 300, 400, 500, 800 VUs, 30 s chacun (hors palier de fumée à 15 s), sans montée
  progressive (k6 `--vus N --duration 30s`, démarrage direct à N, donc une charge plus dure qu'une
  montée en rampe).
- Machine : PC de développement partagé, 16 cœurs, 15 Go de RAM — **pas un serveur dédié** :
  navigateur, IDE, serveur Nuxt du back-office et l'API Nest elle-même tournent en même temps.
  `free -h` pendant les tests montrait ~600 Mo de RAM libre et ~3,5 Go de swap déjà utilisé par les
  autres applications — un facteur de variabilité reconnu, pas corrigé (il n'y a rien à corriger
  côté backend, c'est une limite de la machine de test).

## 2. Résultat trouvé : un vrai bogue, corrigé

Le tout premier palier à 100 VUs donnait déjà un p95 de **257 ms** sur `GET /home` à lui seul
(largement au-dessus des autres endpoints, 17–67 ms) et un palier à 300 VUs faisait déjà dépasser
le seuil de 300 ms (306 à 720 ms selon les essais, avec une forte variance signe de contention).

**Cause réelle (pas un artefact de banc de test)** : `HomeService.personalize()`
(`backend/src/catalog/home.service.ts`) ajoute `isFavorite` / `likes` après le cache, un appel à
`PersonalizationService.decorate()` **par rangée** de l'accueil, chaque appel faisant 2 requêtes
Postgres. Avec 5 rangées actives en dev, c'était donc 10 aller-retours Postgres **séquentiels**
(`await` dans une boucle `for`) pour une seule réponse `/home` — sous charge, chaque aller-retour
fait la queue derrière les autres requêtes pour une connexion, et les temps s'additionnent.

**Cause aggravante trouvée en creusant** : `PrismaService` (`backend/src/prisma/prisma.service.ts`)
construit l'adaptateur `@prisma/adapter-pg` avec juste `{ connectionString }`, sans `max` — la
librairie `pg` retombe alors sur son défaut de **10** connexions dans le pool, bien trop bas dès
une centaine de requêtes simultanées (confirmé par un comportement sensible : requêtes
individuelles rapides au `min`, mais `p95`/`p99` qui explosent — signature classique d'une file
d'attente pour une ressource limitée, pas d'un calcul lent).

### Corrections appliquées

1. `backend/src/catalog/home.service.ts` : `personalize()` regroupe désormais bannières et toutes
   les rangées en un seul tableau avant d'appeler `decorate()` une fois (2 requêtes Postgres au
   total pour toute la page, au lieu de 2 × nombre de rangées). Comportement inchangé (mêmes
   champs, même ordre), couvert par les tests existants de `home.service.spec.ts`.
2. `backend/src/prisma/prisma.service.ts` + `src/config/env.schema.ts` + `src/config/app-config.ts` :
   nouvelle variable `DATABASE_POOL_SIZE` (défaut **20**, documentée dans `.env.example` et le
   README), passée à `PrismaPg({ connectionString, max: … })`. Rester sous `max_connections`
   PostgreSQL (100 en dev) moins la marge pour les autres clients (sauvegarde, admin, migrations,
   autres instances de l'API en production).

Après correction, `npm run lint && npm run build && npm test && npm run test:e2e` restent verts
(251 tests unitaires, 54 e2e).

## 3. Chiffres mesurés (après correction)

Charge mixte (les 6 endpoints par itération), p95 par endpoint, en millisecondes :

| VUs | req/s | erreurs | `/home` | `/series/{id}` | `/series/{id}/episodes` | `/episodes/{id}/play` | `/feed` | `/search` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10  | 37   | 0 % | 86*  | 17  | 42  | 25  | 32  | 31  |
| 100 | 363  | 0 % | 91   | 19  | 21  | 67  | 60  | 48  |
| 300 | 973  | 0 % | 155  | 43  | 64  | 188 | 165 | 146 |
| 400 | 1 218 | 0 % | 222  | 58  | 66  | 229 | 179 | 165 |
| 500 | 1 304 | 0 % | **335** | 105 | 88  | **314** | 279 | 261 |
| 800 | 1 382 | 0 % | **917** | 190 | 183 | 600 | 493 | 489 |

\* Le palier à 10 VUs a tourné avant la correction (artefact JIT/cache froid négligeable à ce
niveau de charge ; refait à titre de palier de fumée, pas republié).

**Lecture** : jusqu'à ~400 VUs, tous les p95 restent sous 300 ms, **zéro erreur HTTP à aucun
palier, y compris à 800 VUs** — la dégradation est propre (file d'attente, pas de 5xx, pas de
connexions refusées). Entre 400 et 500 VUs, `/home` et `/episodes/{id}/play` passent au-dessus du
seuil de 300 ms. Les fichiers bruts (`k6 --summary-export`) sont dans `infra/loadtest/results/`
pour chaque palier.

## 4. Ce qui est validé, ce qui ne l'est pas

**Validé sur ce PC de développement** :
- Le p95 < 300 ms du cahier des charges tient jusqu'à environ 400 utilisateurs virtuels sur le
  mélange d'endpoints de lecture testé.
- L'API ne tombe pas sous la charge : 0 % d'erreurs HTTP jusqu'à 800 VUs (la dégradation est de la
  latence, pas des pannes), ce qui est un signal positif sur la robustesse du code (pas de fuite de
  connexion, pas de crash, pas d'exception non gérée sous contention).
- Un vrai bogue de performance (sérialisation N+1 sur `/home`) et un vrai sous-dimensionnement
  (pool de connexions à 10) ont été trouvés et corrigés avec des gains mesurés (p95 de `/home` à
  100 VUs : 257 ms → 91 ms).

**PAS validé, et ne pouvant pas l'être ici** :
- **Les 5 000 utilisateurs simultanés du cahier des charges n'ont pas été testés et ne peuvent pas
  l'être sur cette machine** : un PC de développement partagé (navigateur, IDE, deux serveurs Node
  en plus de l'API, ~600 Mo de RAM libre observés pendant les tests) avec un seul conteneur
  PostgreSQL non réglé pour la production n'est pas représentatif d'un environnement de recette ou
  de production. Prétendre valider 5 000 CCU ici serait mensonger.
- Le palier maximal testé (800 VUs) montre une dégradation progressive, pas un plafond dur — il est
  probable que la machine tienne un peu plus avant de vraiment craquer, mais aller plus loin sur ce
  PC n'aurait plus rien mesuré d'utile (le goulot se déplace vers des ressources de dev, pas vers un
  comportement représentatif d'un vrai déploiement).
- Pas de test de charge sur les endpoints d'écriture (déblocage, achat, webhooks) — hors périmètre
  du ticket (« endpoints de lecture ») et plus délicat à charger sans polluer le grand livre réel.
- Pas de test longue durée (soak test, fuite mémoire sur plusieurs heures).

## 5. À refaire en recette (staging), une fois le matériel choisi

1. Rejouer `infra/loadtest/read-heavy.js` (même script, juste changer `BASE_URL`) contre l'API de
   recette, avec `PGBouncer` ou équivalent devant Postgres et `DATABASE_POOL_SIZE` ajusté à la
   capacité réelle de la base managée.
   ```bash
   docker run --rm -v "$PWD/infra/loadtest:/scripts" grafana/k6 run /scripts/read-heavy.js \
     -e BASE_URL=https://api-staging.drama.example --vus 2000 --duration 5m
   ```
2. Monter progressivement par paliers de 500 à 1000 jusqu'à 5 000, en surveillant `GET /metrics`
   (`drama_http_request_duration_seconds`) et le tableau de bord Grafana « DRAMA API — latence et
   erreurs » (`infra/docker-compose.monitoring.yml`) plutôt que seulement la sortie k6.
3. Vérifier le pool de connexions Postgres managé (PgBouncer en mode `transaction` recommandé si
   plusieurs instances de l'API tournent derrière le reverse proxy) et le nombre d'instances API
   nécessaires (le CPU du process Node n'a jamais dépassé quelques % sur ce PC — la limite observée
   était côté connexions base, pas CPU applicatif, mais cela peut changer à 5 000 CCU réels).
4. Ajouter un test de montée en rampe (`stages` k6) plutôt qu'un démarrage direct à N VUs, plus
   représentatif d'une vraie montée de trafic.
5. Soak test de quelques heures à charge modérée pour détecter une fuite mémoire/connexions avant
   le lancement.

## 6. Reproduire

```bash
# 1. Préparer un pool de jetons de test (depuis backend/, API de dev en marche)
cd backend && npx tsx scripts/loadtest-seed-users.ts 300

# 2. Lancer un palier (depuis infra/loadtest/)
cd ../infra/loadtest
docker run --rm --network host -e BASE_URL=http://localhost:3000 \
  -v "$PWD:/scripts" grafana/k6 run /scripts/read-heavy.js \
  --vus 300 --duration 30s --summary-export=/scripts/results/vus-300.json

# 3. Nettoyer les comptes de test
cd ../../backend && npx tsx scripts/loadtest-seed-users.ts --cleanup
```
