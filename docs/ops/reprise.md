# Plan de reprise — S10-OPS-03

Cahier des charges §12 : « Plan de reprise : restauration de la base testée trimestriellement,
RPO 24 h, RTO 4 h. »

**Verdict en une phrase : le mécanisme de sauvegarde/restauration fonctionne de bout en bout
(drill exécuté ce jour, données réelles vérifiées à l'identique après restauration) et le RTO
mesuré (moins d'une seconde sur cette base de dev) est très confortablement sous les 4 h cibles ;
le RPO de 24 h tient tel que configuré aujourd'hui, mais un vrai bogue opérationnel a été trouvé
et corrigé au passage (voir §3). En production, le RPO et le RTO réels dépendront de la taille de
la base et du fournisseur managé choisi — voir §5.**

## 1. Ce qui a été testé

Drill complet exécuté le 2026-10-30 contre la base de développement réelle (celle du propriétaire
produit — comptes internes, série « La Nounou » et « Le Secret du Lagon ») :

1. **Sauvegarde** (`infra/scripts/backup.sh`, lecture seule, `pg_dump -Fc`) de la base `drama` en
   marche, sans l'arrêter ni la modifier.
2. **Restauration** (`infra/scripts/restore.sh`) de ce dump dans une base **jetable**
   `drama_restore_drill` — jamais dans `drama` (le script refuse par défaut d'écraser la base de
   dev ; il faudrait explicitement passer `drama` en second argument).
3. **Vérification** : comptage des lignes table par table dans `drama` avant sauvegarde puis dans
   `drama_restore_drill` après restauration, et vérification nominative des deux séries réelles.
4. **Nettoyage** : `DROP DATABASE drama_restore_drill`, suppression du fichier dump temporaire ;
   la base `drama` elle-même n'a jamais été touchée (comptage `users` identique avant/après, `GET
   /series` sur l'API toujours « La Nounou » + « Le Secret du Lagon »).

## 2. Chiffres mesurés

| Mesure | Valeur | Commentaire |
| --- | --- | --- |
| Taille du dump | 156 Ko | Base de dev, peu de contenu réel pour l'instant |
| Durée de la sauvegarde (`pg_dump`) | **0,245 s** | Mesuré par `time`, via le conteneur `drama-postgres` |
| Durée de la restauration (`pg_restore`, création de base incluse) | **0,786 s** | Mesuré par `time`, RTO technique |

Comparaison des lignes, `drama` (avant) vs `drama_restore_drill` (après restauration) :

| Table | Avant | Après restauration | Égal |
| --- | --- | --- | --- |
| `users` | 94 | 94 | ✅ |
| `series` | 5 | 5 | ✅ |
| `episodes` | 6 | 6 | ✅ |
| `coin_ledger` | 15 | 15 | ✅ |
| `wallets` | 94 | 94 | ✅ |
| `purchases` | 7 | 7 | ✅ |
| `unlocks` | 4 | 4 | ✅ |
| `audit_logs` | 294 | 294 | ✅ |

Contenu réel vérifié nominativement dans la base restaurée :

```
       title        |  status   | episode_count
---------------------+-----------+---------------
 La Nounou           | PUBLISHED |             2
 Le Secret du Lagon  | PUBLISHED |             3
```

Identique à la base de production du moment. Aucune erreur `pg_restore` (`--clean --if-exists`
sur une base neuve n'a rien à nettoyer).

## 3. Bogue opérationnel trouvé et corrigé

En inspectant le conteneur `postgres-backup` pour documenter la fréquence réelle des sauvegardes,
un log d'échec est apparu :

```
[backup] 2026-10-30T09:43:03Z /backups/drama-20261030T094303Z.dump (100.0K)
pg_dump: error: connection to server at "postgres" (172.23.0.2), port 5432 failed: Connection refused
[backup] échec 2026-10-30T11:23:08Z
```

**Cause** : la boucle de sauvegarde (`infra/docker-compose.dev.yml`, service `postgres-backup`)
est `while true; do backup.sh || echo échec; sleep $BACKUP_INTERVAL_SECONDS; done`. `depends_on:
postgres: condition: service_healthy` n'est vérifié qu'au `docker compose up` ; si le conteneur de
sauvegarde redémarre seul (politique `restart: unless-stopped`, ex. après un redémarrage du
démon Docker) alors que Postgres n'est pas encore prêt, la tentative échoue — et comme l'ancien
script attendait `$BACKUP_INTERVAL_SECONDS` (24 h) **même après un échec**, un incident de ce
type aurait silencieusement creusé un trou d'une journée dans les sauvegardes, sans alerte. Un
fichier `.dump.part` de 0 octet restait en plus abandonné dans le volume (jamais purgé par la
règle de rétention, qui ne filtre que `*.dump`).

**Correction appliquée** (`infra/docker-compose.dev.yml`, `infra/scripts/backup.sh`) :
- la boucle retente après **5 minutes** en cas d'échec au lieu d'attendre l'intervalle complet ;
- `backup.sh` purge désormais aussi les `.dump.part` abandonnés depuis plus d'une heure.

Revérifié : `docker compose -f infra/docker-compose.dev.yml up -d postgres-backup` a recréé le
conteneur et produit immédiatement une sauvegarde réussie (`drama-20261030T234802Z.dump`, 156 Ko) ;
l'ancien `.part` a été supprimé.

## 4. RPO et RTO — comparaison à la cible du cahier des charges

| | Cible cahier des charges | Mesuré / configuré aujourd'hui |
| --- | --- | --- |
| **RPO** (perte de données maximale) | 24 h | **24 h**, tenu par construction : `BACKUP_INTERVAL_SECONDS=86400`, une sauvegarde complète par jour. Avec le correctif du §3, un échec isolé ne dégrade plus le RPO à « jusqu'à la prochaine fenêtre de 24 h », juste à « jusqu'à la prochaine tentative, 5 min plus tard ». |
| **RTO** (temps pour revenir en service) | 4 h | **0,786 s mesurés** sur cette base de dev (156 Ko). Ce chiffre ne se transpose pas tel quel à la production (voir §5) mais la marge est considérable : il faudrait une base environ 18 000× plus grosse pour consommer les 4 h à la même vitesse d'E/S, ce qui n'arrivera pas avant longtemps à l'échelle du MVP. |

**RPO non couvert par ce drill** : la restauration à un instant précis entre deux sauvegardes
quotidiennes (point-in-time recovery, PITR) n'existe pas en dev (pas d'archivage WAL ici) ; c'est
une fonctionnalité du fournisseur managé en production (voir §5), pas quelque chose que ce script
`pg_dump` quotidien peut offrir seul.

## 5. Procédure à suivre en cas d'incident réel

1. **Évaluer** : panne de la base en cours (données inaccessibles) ou corruption/erreur humaine
   (ex. suppression accidentelle) ? Dans le second cas, arrêter l'API tout de suite
   (`docker compose -f infra/docker-compose.dev.yml stop` ou équivalent en production) pour ne pas
   accumuler de nouvelles écritures incohérentes.
2. **Choisir la source** : la sauvegarde PITR du fournisseur managé (la plus récente, la moins de
   perte) en priorité ; à défaut le dernier `pg_dump` quotidien (`docker exec drama-postgres-backup
   ls -la /backups`, ou le stockage objet chiffré en production).
3. **Ne jamais restaurer en écrasant la base de production sans un test préalable** : restaurer
   d'abord dans une base jetable (`infra/scripts/restore.sh <dump> drama_recovery_check`),
   vérifier les comptages et le contenu attendu (comme au §2), **puis seulement** basculer
   réellement (couper le trafic, restaurer dans la base réelle ou promouvoir une copie, relancer
   `npm run prisma:deploy`, rouvrir le trafic).
4. **Vérifier après coup** : `GET /health`, un parcours fonctionnel minimal (connexion, accueil,
   lecture d'un épisode), et que le grand livre (`coin_ledger`) est cohérent avec les soldes
   (`wallets`) — c'est la règle non négociable du projet (§ CLAUDE.md : le solde n'est qu'une
   projection du grand livre).
5. **Documenter l'incident** : durée réelle d'indisponibilité (RTO réel), volume de données perdu
   si restauration pas au point exact de la panne (RPO réel), cause, correctif.

## 6. À refaire en recette / production

- **Base managée** : activer la récupération à un instant donné (PITR, sauvegardes automatiques +
  archivage WAL) du fournisseur, et conserver en plus ce `pg_dump` quotidien chiffré hors du
  fournisseur (`infra/README.md` le documente déjà : rétention 30 jours, stockage objet séparé).
- **Tester un vrai RTO à l'échelle** : ce drill (156 Ko) ne mesure pas le temps de restauration
  d'une base de plusieurs Go ou dizaines de Go — à refaire avec un volume de données réaliste une
  fois en recette, pour un chiffre de RTO qui veuille vraiment dire quelque chose face aux 4 h
  cibles.
- **Restauration trimestrielle réelle** (cahier des charges) : planifier ce même drill (sauvegarde
  → restauration dans une base jetable → vérification → suppression) comme une tâche récurrente
  une fois en production, pas seulement en dev.
- **Alerte** : brancher une alerte (Alertmanager, cahier des charges §12) si la dernière sauvegarde
  réussie a plus de `BACKUP_INTERVAL_SECONDS × 2` d'ancienneté, pour détecter un échec persistant
  sans attendre un incident pour s'en rendre compte.

## 7. Reproduire ce drill

```bash
# 1. Sauvegarde (lecture seule, ne touche jamais la base de dev)
infra/scripts/backup.sh /tmp/drama-backup-drill

# 2. Restauration dans une base jetable (jamais `drama`)
infra/scripts/restore.sh /tmp/drama-backup-drill/drama-<horodatage>.dump drama_restore_drill

# 3. Vérification
docker exec drama-postgres psql -U drama -d drama_restore_drill -c \
  "SELECT title, status FROM series WHERE title IN ('La Nounou','Le Secret du Lagon');"

# 4. Nettoyage
docker exec drama-postgres psql -U drama -d postgres -c "DROP DATABASE drama_restore_drill;"
rm -rf /tmp/drama-backup-drill
```
