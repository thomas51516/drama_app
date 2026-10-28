# Backlog par sprint — MVP micro-séries verticales (Android)

Dérivé du cahier des charges du 28 octobre 2026. 12 sprints de 2 semaines, 4 phases, 3 jalons.

## Conventions

- **Identifiant de ticket** : `S<sprint>-<lot>-<n°>`. Lots : `PM` pilotage et analyse, `UX` design, `OPS` DevOps, `BE` backend, `WEB` back-office et site de recharge, `A1` et `A2` les deux développeurs Android, `QA` recette, `EXT` actions client ou prestataires externes.
- **Réf.** renvoie aux références M-xx (app), B-xx (back-office) et aux sections du cahier des charges.
- **Règle de priorité** : un ticket P2 n'entre dans un sprint que si tous les P1 du sprint précédent sont clos. Les P3 sont hors MVP.
- **Definition of Done** : code revu, tests unitaires passants, déployé en staging, critère d'acceptation vérifié par QA (à partir du sprint 5) ou par le PM avant.
- **Rituels** : planification le lundi de la semaine 1, démo et rétrospective le vendredi de la semaine 2.

## Vue d'ensemble

| Sprint | Semaines | Phase | Objectif | Jalon |
| --- | --- | --- | --- | --- |
| 1 | 1-2 | 0 Fondations | Cadrage, socle technique, spike lecteur | |
| 2 | 3-4 | 0 Fondations | Décisions actées, auth invité, lecteur vertical | |
| 3 | 5-6 | 1 Regarder | Catalogue back-office, accueil et fiche série | |
| 4 | 7-8 | 1 Regarder | Upload en masse, lecture signée, flux vertical | |
| 5 | 9-10 | 1 Regarder | Connexion, recherche, favoris, i18n | |
| 6 | 11-12 | 1 Regarder | Performance, push, accessibilité | **Jalon 1** |
| 7 | 13-14 | 2 Payer | Portefeuille, déblocage, Google Play Billing | |
| 8 | 15-16 | 2 Payer | VIP, pub récompensée, check-in | |
| 9 | 17-18 | 2 Payer | Mobile money, analytics, sécurité app | |
| 10 | 19-20 | 2 Payer / 3 Lancer | Test de charge, P2, pentest lancé | **Jalon 2** |
| 11 | 21-22 | 3 Lancer | Bêta fermée, corrections, fiche Play Store | |
| 12 | 23-24 | 3 Lancer | Mise en production, déploiement progressif | **Jalon 3** |

---

## Sprint 1 — Cadrage et socle (semaines 1-2)

**Objectif** : décisions préparées, dépôts et environnements prêts, lecteur HLS mesuré en 4G.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S01-PM-01 | PM | Ateliers de cadrage (parcours, règles de monétisation, catalogue) | §1, §3 | Compte rendu validé par le client |
| S01-PM-02 | PM | Backlog priorisé et plan de marquage v0 | §13 | Liste d'événements avec propriétés |
| S01-PM-03 | PM | Comparatif fournisseurs vidéo (DRM Widevine, PoP Afrique de l'Ouest, coût/minute) | §9 | Tableau avec recommandation |
| S01-UX-01 | UX | Design system (couleurs, typo, composants Material 3) | §7 | Fichier Figma partagé |
| S01-UX-02 | UX | Wireframes accueil, flux, fiche série, lecteur + paywall, boutique | §4 | 5 écrans validés en atelier |
| S01-OPS-01 | OPS | Dépôts git android / backend / web, CI lint + tests | §12 | Pipeline vert sur commit vide |
| S01-OPS-02 | OPS | Docker Compose dev : PostgreSQL, Redis, MinIO | §12 | `docker compose up` fonctionnel |
| S01-OPS-03 | OPS | Provisionnement VPS staging, DNS, Traefik + TLS | §12 | HTTPS sur staging |
| S01-BE-01 | BE | Squelette NestJS, config, healthcheck, Swagger | §8.1 | `/health` et `/docs` en staging |
| S01-BE-02 | BE | Modèle de données complet et migrations initiales (toutes entités §8.3) | §8.3 | Migrations rejouables de zéro |
| S01-BE-03 | BE | OpenAPI v0.1 : auth, catalogue, lecture | §8.2 | Fichier revu par Android |
| S01-A1-01 | A1 | Squelette multi-module core / data / domain / feature-* | §7 | Build Gradle < 2 min |
| S01-A1-02 | A1 | Hilt, Retrofit + kotlinx.serialization, thème M3, Navigation Compose | §7 | Écran vide navigable |
| S01-A2-01 | A2 | Spike lecteur : Media3 + HLS fournisseur candidat, PreloadManager | §7, M-12 | Démarrage mesuré en 4G réelle |
| S01-A2-02 | A2 | Rapport de spike : temps de démarrage, consommation mémoire entrée de gamme | M-12 | Décision go sur le fournisseur |
| S01-EXT-01 | EXT | Création compte Play Console et lancement de la vérification d'identité | §10 | Compte en cours de vérification |
| S01-EXT-02 | EXT | Projet Firebase (FCM, Analytics, Crashlytics, Remote Config) | §7 | Clés remises aux équipes |
| S01-EXT-03 | EXT | Compte AdMob, demande de sandbox agrégateur mobile money | §10 | Accès sandbox obtenu |
| S01-EXT-04 | EXT | Saisine conseil juridique : lien paiement externe, déclaration IPDCP | §14 | Lettre de mission signée |

**Démo** : une vidéo HLS lue dans un écran Android, temps de démarrage affiché.

---

## Sprint 2 — Fondations (semaines 3-4)

**Objectif** : socle complet, compte invité, lecteur vertical avec balayage.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S02-PM-01 | PM | Décisions actées : fournisseur vidéo, OTP, régie pub, DRM au lancement | §7, §9, §10 | Compte rendu de décision |
| S02-PM-02 | PM | Spécifications détaillées du parcours « regarder » | §4.1, §4.2 | Document validé |
| S02-PM-03 | PM | Lancement rédaction CGU, CGV, politique de confidentialité | §14 | Brief envoyé au juriste |
| S02-UX-01 | UX | Maquettes haute fidélité des 5 écrans critiques | §4 | Prototype Figma cliquable |
| S02-OPS-01 | OPS | CI/CD backend vers staging, secrets chiffrés dans le CI | §12 | Déploiement automatique sur main |
| S02-OPS-02 | OPS | Sentry (API), Prometheus + Grafana, Loki | §12 | Tableau de bord staging |
| S02-BE-01 | BE | `POST /auth/guest`, `POST /auth/refresh`, JWT courts + refresh | §8.2, M-50 | Tests d'intégration verts |
| S02-BE-02 | BE | Garde d'authentification, limitation de débit sur `/auth/*` | §12 | 429 après seuil |
| S02-BE-03 | BE | OpenAPI v1 complète + serveur de mocks pour Android | §8.2 | Mock déployé en staging |
| S02-BE-04 | BE | Intégration stockage objet : URL pré-signée d'upload | §6, §9 | Upload direct testé |
| S02-BE-05 | BE | Webhook transcodage du fournisseur vidéo (réception, signature) | §9 | Statut épisode mis à jour |
| S02-A1-01 | A1 | Couche réseau branchée sur le mock, gestion erreurs et retry | §7 | Tests unitaires repository |
| S02-A1-02 | A1 | Auth invité au premier lancement, session dans DataStore | M-50 | Token persistant après redémarrage |
| S02-A1-03 | A1 | Room : schéma progression, historique, cache catalogue | §7 | Migrations Room testées |
| S02-A1-04 | A1 | Firebase Crashlytics et Analytics intégrés | §7 | Événement `app_open` visible |
| S02-A2-01 | A2 | Composant lecteur vertical plein écran, VerticalPager | M-11 | Balayage haut = épisode suivant |
| S02-A2-02 | A2 | Préchargement épisode suivant, SimpleCache | M-12 | Démarrage épisode N+1 < 1 s |
| S02-A2-03 | A2 | Contrôles : pause, avance/retour, barre de progression | M-13 | Gestes validés sur 2 appareils |
| S02-EXT-01 | EXT | Compte fournisseur vidéo ouvert, 3 épisodes test transcodés | §9 | Manifestes HLS disponibles |

**Démo** : l'app crée un compte invité et lit 3 épisodes test en balayant.

---

## Sprint 3 — Catalogue (semaines 5-6)

**Objectif** : l'éditeur crée une série dans le back-office, l'app l'affiche.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S03-PM-01 | PM | Spécifications détaillées monétisation et portefeuille | §3, §4.3, §4.4 | Document validé |
| S03-PM-02 | PM | Plan de marquage v1 (événements, propriétés, écrans) | §13 | Validé par Android et BE |
| S03-UX-01 | UX | Maquettes boutique, portefeuille, compte, paywall | §4.3, §4.4, §4.6 | Figma validé |
| S03-UX-02 | UX | Maquettes back-office : catalogue, épisodes, sous-titres | B-01 à B-03 | Figma validé |
| S03-OPS-01 | OPS | Pipeline AAB signé, distribution interne Firebase App Distribution | §12 | Build installable à chaque merge |
| S03-BE-01 | BE | Admin séries : CRUD, statuts brouillon / publié / archivé, classification d'âge | B-01 | Tests d'intégration |
| S03-BE-02 | BE | Admin épisodes : création, URL d'upload, suivi transcodage, numérotation | B-02 | Épisode passe à « prêt » par webhook |
| S03-BE-03 | BE | Admin sous-titres : import VTT/SRT, conversion, stockage | B-03 | VTT servi par CDN |
| S03-BE-04 | BE | Comptes internes, rôles, journal d'audit (socle) | B-13 | Action tracée avec ancienne valeur |
| S03-WEB-01 | WEB | Squelette Nuxt 3 back-office, Pinia, PrimeVue, Tailwind | §11 | Déployé en staging |
| S03-WEB-02 | WEB | Login admin JWT + TOTP obligatoire | §11 | 2FA imposée à la première connexion |
| S03-WEB-03 | WEB | Module Catalogue : création et édition de série, affiches | B-01 | Série créée visible via API |
| S03-A1-01 | A1 | Écran d'accueil : bannière, rangées Tendances, Nouveautés, par genre | M-01 | Rendu conforme à la maquette |
| S03-A1-02 | A1 | Fiche série : affiche, synopsis, grille d'épisodes | M-10 | Statuts gratuit / verrouillé affichés |
| S03-A2-01 | A2 | Sous-titres activables, choix de langue | M-14 | VTT rendu synchronisé |
| S03-A2-02 | A2 | Vitesse 0,75x à 2x, qualité auto ou manuelle | M-13 | Réglages persistants |
| S03-A2-03 | A2 | Reprise à la seconde près, `PUT /progress` toutes les 5 s | M-15 | Reprise après kill de l'app |

**Démo** : série créée dans le back-office, affichée dans l'app et lue avec sous-titres.

---

## Sprint 4 — Lecture complète (semaines 7-8)

**Objectif** : upload en masse, lecture par URL signée, flux « Pour vous ».

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S04-PM-01 | PM | Spécifications récompenses, notifications, compte | §4.5, §4.6 | Document validé |
| S04-UX-01 | UX | Maquettes récompenses, check-in, centre d'aide | M-40, M-53 | Figma validé |
| S04-BE-01 | BE | `GET /home` avec rangées paramétrées, `GET /series`, `GET /series/{id}/episodes` avec statut par utilisateur | M-01, M-10 | Statuts corrects pour invité |
| S04-BE-02 | BE | `POST /episodes/{id}/play` : vérification du droit, URL de manifeste signée expirante | §9, M-11 | 403 sur épisode verrouillé |
| S04-BE-03 | BE | `GET /feed` : extraits de 15 s et premiers épisodes, pagination | M-02 | Réponse < 300 ms p95 |
| S04-BE-04 | BE | Cache Redis du catalogue, invalidation à la publication | §8.1 | Hit ratio mesuré |
| S04-WEB-01 | WEB | Upload en masse reprenable (tus ou multipart S3), file d'attente | B-02 | 50 fichiers de 100 Mo sans échec |
| S04-WEB-02 | WEB | Suivi du transcodage, aperçu, réordonnancement par glisser-déposer | B-02 | Statut temps réel |
| S04-WEB-03 | WEB | Import SRT/VTT par langue et aperçu synchronisé | B-03 | Aperçu lisible |
| S04-A1-01 | A1 | Flux vertical « Pour vous », lecture automatique | M-02 | Défilement 60 fps |
| S04-A1-02 | A1 | Rangée « Continuer à regarder » depuis la progression | M-01, M-15 | Mise à jour après lecture |
| S04-A1-03 | A1 | Partage par lien profond, App Links configurés | M-16 | Lien ouvre la fiche série |
| S04-A2-01 | A2 | Lecture via URL signée, rafraîchissement à expiration | §9 | Pas de coupure à l'expiration |
| S04-A2-02 | A2 | Enchaînement automatique, écran de fin d'épisode | M-11 | Transition sans écran noir |
| S04-A2-03 | A2 | Gestion des coupures réseau : reprise automatique, mode dégradé 3G | §7 | Reprise après 30 s hors ligne |
| S04-A2-04 | A2 | Reprise cross-device : position serveur prioritaire | M-15 | Testé sur 2 appareils |

**Démo** : série de 10 épisodes uploadée en masse, lue de bout en bout dans le flux.

---

## Sprint 5 — Compte et recherche (semaines 9-10)

**Objectif** : connexion, rattachement du compte invité, recherche, favoris. Arrivée du QA.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S05-PM-01 | PM | Formation de l'équipe éditoriale au back-office, plan d'ingestion des 10 séries | §1 | Planning d'ingestion |
| S05-OPS-01 | OPS | Sauvegarde quotidienne PostgreSQL + PITR, alertes de base | §12 | Restauration testée en staging |
| S05-BE-01 | BE | `POST /auth/google` | M-51 | Compte créé ou lié |
| S05-BE-02 | BE | `POST /auth/otp/request` et `/verify`, fournisseur SMS, limitation de débit | M-51 | OTP reçu au Togo, en Côte d'Ivoire |
| S05-BE-03 | BE | Connexion e-mail, rattachement invité vers inscrit avec fusion de l'historique | M-50 | Progression conservée après rattachement |
| S05-BE-04 | BE | `GET/PATCH/DELETE /me`, suppression de compte différée et anonymisation | M-52, §14 | Données purgées après délai |
| S05-BE-05 | BE | Favoris `GET/POST/DELETE /me/favorites`, « J'aime » | M-16 | Tests d'intégration |
| S05-BE-06 | BE | `GET /search` plein texte PostgreSQL, suggestions | M-03 | Résultats < 200 ms |
| S05-WEB-01 | WEB | Comptes internes, rôles, consultation du journal d'audit | B-13 | Filtrage par acteur et date |
| S05-WEB-02 | WEB | Mise en avant : bannières, rangées de l'accueil, ordre, par pays | B-05 | Changement visible dans l'app |
| S05-A1-01 | A1 | Recherche : titre, genre, mot-clé, suggestions, historique | M-03 | Historique local effaçable |
| S05-A1-02 | A1 | Ma liste et J'aime | M-16 | Synchronisé serveur |
| S05-A1-03 | A1 | Profil, langue, préférences de notification, suppression du compte | M-52 | Suppression confirmée par e-mail |
| S05-A2-01 | A2 | Connexion Google, téléphone + OTP, e-mail | M-51 | 3 parcours validés |
| S05-A2-02 | A2 | Rattachement du compte invité avec conservation de l'historique | M-50 | Testé avec progression existante |
| S05-A2-03 | A2 | Internationalisation : FR, EN, ES, PT | §1 | Aucune chaîne en dur |
| S05-QA-01 | QA | Cahier de recette du lot « regarder », matrice de 8 appareils | §15.3 | Cahier validé par le PM |
| S05-QA-02 | QA | Première campagne sur 4 appareils, défauts qualifiés | §15.3 | Rapport de campagne |
| S05-QA-03 | QA | Tests API automatisés : auth, catalogue, play | §7 | Suite dans le CI |

**Démo** : connexion sur un second appareil, historique et favoris retrouvés.

---

## Sprint 6 — Jalon 1 : regarder (semaines 11-12)

**Objectif** : performance, push, accessibilité. Démo client et go ingestion.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S06-PM-01 | PM | Préparation et animation de la démo jalon 1 | §15 | PV de jalon signé |
| S06-PM-02 | PM | Go ingestion du catalogue de lancement | §1 | Première série complète en staging |
| S06-OPS-01 | OPS | Mesure p95 des endpoints de lecture, alertes de latence | §12 | p95 < 300 ms |
| S06-BE-01 | BE | FCM : enregistrement des tokens, envoi, notification « nouvel épisode d'une série suivie » | M-54 | Push reçu sur série favorite |
| S06-BE-02 | BE | Centre d'aide : FAQ et formulaire de contact (endpoints) | M-53 | Ticket créé et notifié par e-mail |
| S06-BE-03 | BE | Événements serveur analytics : `series_view`, `episode_start`, `episode_complete` | §13 | Export BigQuery vérifié |
| S06-WEB-01 | WEB | Tableau de bord v0 : utilisateurs actifs, top séries | B-11 | Graphiques ECharts |
| S06-WEB-02 | WEB | Guide back-office v0 (catalogue, épisodes, sous-titres) | §15.1 | Relu par l'équipe éditoriale |
| S06-A1-01 | A1 | Centre d'aide, FAQ, formulaire de contact | M-53 | Envoi confirmé |
| S06-A1-02 | A1 | Réception et routage des notifications push | M-54 | Push ouvre la fiche série |
| S06-A1-03 | A1 | Accessibilité : tailles dynamiques, libellés lecteur d'écran, contrastes | §7 | Audit TalkBack sans blocage |
| S06-A2-01 | A2 | Démarrage lecture < 1,5 s en 4G : premier segment basse qualité, ABR réglé | M-12, §9 | Mesure sur 3 appareils |
| S06-A2-02 | A2 | Démarrage à froid < 2,5 s sur appareil 2 Go, baseline profile | §7 | Macrobenchmark en CI |
| S06-A2-03 | A2 | Taille AAB < 30 Mo, R8 activé | §7 | Taille vérifiée en CI |
| S06-QA-01 | QA | Recette complète du lot « regarder » sur 8 appareils | §15.3 | Aucun défaut bloquant |
| S06-QA-02 | QA | Rapport de recette jalon 1 | §15.1 | Remis au client |

**Jalon 1** : une série réelle se regarde de bout en bout, l'ingestion éditoriale démarre.

---

## Sprint 7 — Portefeuille et déblocage (semaines 13-14)

**Objectif** : grand livre des pièces, déblocage atomique, achat Google Play en sandbox.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S07-PM-01 | PM | Grille tarifaire v1 : packs, coût par épisode, formules VIP, prix par devise | §3, §10 | Validée par le client |
| S07-OPS-01 | OPS | Abonnement Pub/Sub pour RTDN, compte de service Google Play Developer API | §10 | Notification test reçue |
| S07-BE-01 | BE | `wallets` et `coin_ledger` : solde comme projection, aucune mise à jour directe | §8.4 | Test de recalcul du solde |
| S07-BE-02 | BE | `POST /episodes/{id}/unlock` : transaction atomique, clé d'idempotence, bonus avant achetées | §8.4, M-21 | Double appel débite une fois |
| S07-BE-03 | BE | Déblocage automatique optionnel, `unlocks` unique (utilisateur, épisode) | §3 | Pas de doublon sous concurrence |
| S07-BE-04 | BE | `GET /wallet`, `GET /wallet/transactions` | M-32 | Pagination |
| S07-BE-05 | BE | Paramètres monétisation : épisodes gratuits, coût par épisode et par série | B-06 | Effet immédiat dans `/episodes` |
| S07-BE-06 | BE | `POST /billing/google/verify` : vérification Developer API, crédit, acquittement, `purchases` | §8.4, M-31 | Achat sandbox crédité une fois |
| S07-BE-07 | BE | `POST /webhooks/google-rtdn` : réception, signature, file BullMQ | §10 | Événements journalisés |
| S07-WEB-01 | WEB | Module Monétisation : épisodes gratuits, coûts, packs, formules VIP, plafond de pubs | B-06 | Modifications auditées |
| S07-WEB-02 | WEB | Module Récompenses : barème check-in, validité des pièces bonus | B-08 | Barème appliqué par l'API |
| S07-A1-01 | A1 | Paywall en fin d'épisode gratuit : solde, coût, boutons pièces / VIP / pub | M-20 | Conforme à la maquette |
| S07-A1-02 | A1 | Déblocage par pièces avec confirmation, option automatique | M-21 | Solde mis à jour sans rechargement |
| S07-A1-03 | A1 | Portefeuille : soldes achetés / bonus, historique | M-32 | Liste paginée |
| S07-A2-01 | A2 | Intégration Google Play Billing Library, requête des produits | M-31 | Prix locaux affichés |
| S07-A2-02 | A2 | Boutique : packs de pièces, prix en devise locale | M-30 | Conforme à la maquette |
| S07-A2-03 | A2 | Achat consommable, envoi du jeton au serveur, consommation après crédit | M-31 | Achat sandbox de bout en bout |
| S07-QA-01 | QA | Tests API portefeuille : idempotence, concurrence, solde négatif | §8.4 | Suite automatisée |
| S07-EXT-01 | EXT | Produits créés dans la Play Console, testeurs de licence, piste interne publiée | §10 | Achat sandbox possible |

**Démo** : achat d'un pack en sandbox, pièces créditées, épisode débloqué.

---

## Sprint 8 — VIP, pub récompensée, check-in (semaines 15-16)

**Objectif** : les quatre moyens de déblocage fonctionnent et sont vérifiés côté serveur.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S08-PM-01 | PM | Validation juridique du lien mobile money reçue, décision d'affichage | §10, §14 | Avis écrit archivé |
| S08-BE-01 | BE | `subscriptions` : activation, renouvellement, annulation, expiration via RTDN ; statut VIP sur `users` | M-33, §10 | Cycle complet en sandbox |
| S08-BE-02 | BE | Remboursements : débit des pièces, solde négatif bloquant | §10 | Déblocage refusé si solde < 0 |
| S08-BE-03 | BE | `POST /ads/reward` : SSV AdMob signé, plafond quotidien dans Redis, séries éligibles | §8.4, M-22 | Signal app seul ne crédite pas |
| S08-BE-04 | BE | `POST /rewards/checkin` : barème sur 7 jours, idempotence journalière | M-40 | Un seul crédit par jour |
| S08-BE-05 | BE | Expiration des pièces bonus : tâche BullMQ quotidienne | §8.4 | Ligne d'expiration dans le grand livre |
| S08-BE-06 | BE | Restauration des achats : réconciliation des jetons Google | M-31 | Achat non acquitté retrouvé |
| S08-WEB-01 | WEB | Module Utilisateurs : recherche, historique achats et déblocages | B-09 | Recherche par téléphone et e-mail |
| S08-WEB-02 | WEB | Crédit / débit manuel journalisé, blocage de compte | B-09 | Ligne d'audit avec motif |
| S08-A1-01 | A1 | Pub récompensée : SDK AdMob, déblocage dans la limite quotidienne | M-22 | Compteur quotidien affiché |
| S08-A1-02 | A1 | Check-in quotidien avec pièces croissantes | M-40 | Animation et solde mis à jour |
| S08-A1-03 | A1 | Événements analytics : `paywall_view`, `unlock`, `purchase`, `ad_reward`, `checkin` | §13 | Visibles dans Firebase |
| S08-A2-01 | A2 | Achat d'abonnement VIP, restauration des achats | M-31, M-33 | Cycle sandbox validé |
| S08-A2-02 | A2 | Gestion VIP : statut, échéance, lien Google Play | M-33 | Conforme à la maquette |
| S08-A2-03 | A2 | Statut VIP dans la grille et le lecteur : pas de paywall | M-10, M-20 | Testé avec abonnement actif |
| S08-QA-01 | QA | Parcours achat de bout en bout en sandbox, scénarios de remboursement | §15.3 | Rapport |
| S08-QA-02 | QA | Recette continue des lots 7 et 8 | §15.3 | Défauts qualifiés |

**Démo** : VIP débloque tout, une pub débloque un épisode, le check-in crédite.

---

## Sprint 9 — Mobile money, analytics, sécurité app (semaines 17-18)

**Objectif** : site de recharge, tableaux de bord, durcissement de l'application.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S09-PM-01 | PM | Fiche Play Store en 4 langues, captures, vidéo de présentation | §14 | Brouillon prêt |
| S09-OPS-01 | OPS | Cloudflare devant l'API : WAF, anti-DDoS, pinning côté app documenté | §12 | Trafic via Cloudflare |
| S09-OPS-02 | OPS | Scripts de test de charge k6 : accueil, play, unlock | §12 | Scénario rejoué en staging |
| S09-BE-01 | BE | `POST /webhooks/mobile-money/{provider}` : signature, idempotence, crédit | §10 | Paiement sandbox crédité |
| S09-BE-02 | BE | Réconciliation quotidienne transactions / pièces, rapport d'écarts | §10 | Rapport envoyé par e-mail |
| S09-BE-03 | BE | Endpoints d'agrégats pour les tableaux de bord | B-11 | Requêtes < 1 s |
| S09-BE-04 | BE | Campagnes push ciblées : tous, pays, série suivie, inactifs (P2) | B-10 | Segment calculé |
| S09-WEB-01 | WEB | Site de recharge : connexion même compte, packs, paiement agrégateur, confirmation | §10, §11 | Parcours sandbox complet |
| S09-WEB-02 | WEB | Site de recharge : SSR, responsive, < 300 Ko par page | §11 | Lighthouse mobile > 90 |
| S09-WEB-03 | WEB | Tableaux de bord : revenus par source, rétention par épisode, conversion paywall | B-11 | Données cohérentes avec le grand livre |
| S09-A1-01 | A1 | Plan de marquage complet côté app, Remote Config (épisode du paywall, prix) | §13 | Tous les événements §13 émis |
| S09-A1-02 | A1 | Attribution AppsFlyer ou Adjust, liens différés | §13 | Installation attribuée en test |
| S09-A1-03 | A1 | Lien vers la recharge mobile money, activable par Remote Config | M-34 | Masqué par défaut |
| S09-A2-01 | A2 | Mode économie de données | M-17 | Qualité plafonnée en mobile |
| S09-A2-02 | A2 | Lecture en arrière-plan bloquée, captures bloquées sur épisodes payants | M-18 | FLAG_SECURE vérifié |
| S09-A2-03 | A2 | Play Integrity, Firebase App Check, certificate pinning, aucun secret dans l'APK | §7 | Audit statique de l'APK |
| S09-QA-01 | QA | Recette monétisation sur 8 appareils dont 3 d'entrée de gamme | §15.3 | Rapport |
| S09-QA-02 | QA | Parcours mobile money en sandbox | §15.3 | Rapport |

**Démo** : recharge mobile money en sandbox créditée, tableaux de bord remplis.

---

## Sprint 10 — Jalon 2 : payer (semaines 19-20)

**Objectif** : tenue de charge, P2 priorisées, pentest lancé.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S10-PM-01 | PM | Démo jalon 2 : achat Google sandbox et mobile money réel à faible montant | §15.3 | PV de jalon signé |
| S10-PM-02 | PM | Formulaire « Sécurité des données », classification du contenu | §14 | Soumis dans la Play Console |
| S10-OPS-01 | OPS | Test de charge 5 000 utilisateurs simultanés, corrections | §12 | p95 < 300 ms sous charge |
| S10-OPS-02 | OPS | Commande et démarrage du test d'intrusion externe | §12 | Périmètre validé |
| S10-OPS-03 | OPS | Restauration de base testée, RPO 24 h, RTO 4 h documentés | §12 | Procédure exécutée |
| S10-BE-01 | BE | Limitation de débit sur unlock et OTP, revue de l'idempotence | §12 | Tests de charge verts |
| S10-BE-02 | BE | Déblocage de série entière à prix réduit (P2) | M-23 | Transaction unique |
| S10-BE-03 | BE | Offres de bienvenue, offres limitées, codes promo (P2) | B-07, M-24 | Code appliqué une fois |
| S10-BE-04 | BE | Publication programmée de séries et d'épisodes (P2) | B-04 | Épisode visible à l'heure |
| S10-BE-05 | BE | Activation Widevine sur les épisodes payants | §9 | Lecture refusée sans licence |
| S10-WEB-01 | WEB | Offres et codes promo (P2) | B-07 | UI auditée |
| S10-WEB-02 | WEB | Planification (P2), campagnes push (P2) | B-04, B-10 | Campagne test envoyée |
| S10-A1-01 | A1 | Déblocage de série entière (P2), offre de bienvenue (P2) | M-23, M-24 | Testé en sandbox |
| S10-A1-02 | A1 | Classements du jour, de la semaine, par genre (P2) | M-04 | Conforme à la maquette |
| S10-A2-01 | A2 | Lecture Widevine dans Media3 | §9 | Épisode payant lu avec DRM |
| S10-A2-02 | A2 | Corrections performance et stabilité issues de la recette | §7 | Crash-free > 99,5 % en interne |
| S10-QA-01 | QA | Campagne complète P1 sur 8 appareils | §15.3 | Aucun bloquant ni majeur |
| S10-QA-02 | QA | Rapport de recette jalon 2 et liste des défauts mineurs datés | §15.3 | Remis au client |

**Jalon 2** : monétisation validée, tenue de charge prouvée.

---

## Sprint 11 — Bêta fermée (semaines 21-22)

**Objectif** : 100 testeurs sur piste fermée, corrections, conformité Play Store.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S11-PM-01 | PM | Recrutement et animation des 100 testeurs, canal de retours | §15.3 | 100 inscrits actifs |
| S11-PM-02 | PM | CGU, CGV, politique de confidentialité, mentions légales publiées | §14 | Liens en ligne |
| S11-PM-03 | PM | Page web de suppression de compte | §14 | Accessible depuis la fiche Play |
| S11-OPS-01 | OPS | Environnement de production provisionné, base managée, sauvegardes | §12 | Checklist prod validée |
| S11-OPS-02 | OPS | Runbook d'exploitation, alertes, astreinte lancement | §15.1 | Guide d'exploitation v1 |
| S11-BE-01 | BE | Corrections issues du test d'intrusion | §12 | Rapport de contre-test |
| S11-BE-02 | BE | Corrections des défauts bêta bloquants et majeurs | §15.3 | Liste close |
| S11-WEB-01 | WEB | Guide back-office final, formation support et monétisation | §15.1 | Session réalisée |
| S11-WEB-02 | WEB | Restriction IP du back-office, revue des rôles | §11 | Accès hors liste refusé |
| S11-A1-01 | A1 | Build bêta sur piste fermée, suivi Crashlytics | §15.3 | Crash-free ≥ 99,5 % |
| S11-A1-02 | A1 | Corrections défauts bêta | §15.3 | Liste close |
| S11-A2-01 | A2 | Corrections défauts bêta, vérification AdMob en conditions réelles | M-22 | Pub servie sur piste fermée |
| S11-QA-01 | QA | Triage des retours bêta, tests de non-régression | §15.3 | Rapport mi-bêta |
| S11-EXT-01 | EXT | Approbation AdMob de l'application | §10 | Statut approuvé |

**Démo** : rapport de mi-bêta, défauts et stabilité.

---

## Sprint 12 — Jalon 3 : lancement (semaines 23-24)

**Objectif** : mise en production et déploiement progressif.

| ID | Lot | Ticket | Réf. | Critère d'acceptation |
| --- | --- | --- | --- | --- |
| S12-PM-01 | PM | Gel du code en milieu de sprint, go / no-go de lancement | §15 | Décision tracée |
| S12-PM-02 | PM | Remise des livrables : code, OpenAPI, guides, plan de marquage, rapports | §15.1 | Bordereau signé |
| S12-PM-03 | PM | Démarrage de la garantie de 3 mois, processus de support | §15.3 | Canal ouvert |
| S12-OPS-01 | OPS | Migration et bascule en production, supervision renforcée 48 h | §12 | Aucune alerte critique |
| S12-OPS-02 | OPS | Plan de reprise documenté et testé en production | §12 | PV de restauration |
| S12-BE-01 | BE | Corrections finales bêta, migration des données de staging utiles | §15.3 | Liste close |
| S12-WEB-01 | WEB | Back-office et site de recharge en production | §11 | Accessibles en HTTPS |
| S12-A1-01 | A1 | AAB de production, déploiement progressif 10 % puis 50 % puis 100 % | §7 | Paliers franchis |
| S12-A2-01 | A2 | Surveillance Crashlytics et ANR, correctif d'urgence si besoin | §7 | Crash-free ≥ 99,5 % |
| S12-QA-01 | QA | Recette finale en production, PV de recette | §15.3 | Défauts mineurs datés |

**Jalon 3** : application publiée sur Google Play.

---

## Parking P3 et hors MVP

| Réf. | Fonction | Décision |
| --- | --- | --- |
| M-05 | Calendrier des sorties avec rappel | Phase 2 |
| M-42 | Parrainage | Phase 2 |
| B-12 | Droits et contrats | Phase 2, suivi en tableur d'ici là |
| §9 | Filigrane utilisateur | Phase 2 |
| §13 | Recommandation par historique | Phase 2 |
| §1 | iOS, TV, hors ligne, commentaires | Hors MVP |

## Calendrier des dépendances externes

| Dépendance | Lancer au plus tard | Nécessaire pour |
| --- | --- | --- |
| Vérification compte Play Console | Sprint 1 | Piste interne au sprint 7 |
| Compte fournisseur vidéo et DRM | Sprint 2 | Lecture réelle au sprint 3 |
| Sandbox agrégateur mobile money | Sprint 1 | Webhooks au sprint 9 |
| Fournisseur OTP SMS | Sprint 2 | Connexion au sprint 5 |
| Avis juridique lien externe | Sprint 1 | Décision au sprint 8 |
| Déclaration IPDCP | Sprint 2 | Publication au sprint 12 |
| Test d'intrusion | Sprint 10 | Corrections au sprint 11 |
| 10 séries ingérées | Sprint 6 | Bêta au sprint 11 |
