# Sprint 1 — Cadrage et socle (semaines 1-2)

Démarré le 28 octobre 2026. Objectif : décisions préparées, dépôts et environnements prêts, lecteur HLS mesuré en 4G.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S01-OPS-01 | OPS | Dépôt git monorepo, CI lint + tests par lot | Terminé : CI backend, web et Android |
| S01-OPS-02 | OPS | Docker Compose dev : PostgreSQL, Redis, MinIO | Terminé, vérifié, commité |
| S01-OPS-03 | OPS | VPS staging, DNS, Traefik + TLS | Bloqué : nécessite un hébergeur et un nom de domaine |
| S01-BE-01 | BE | Squelette NestJS, config, healthcheck, Swagger | Terminé, vérifié, commité |
| S01-BE-02 | BE | Modèle de données complet et migrations initiales | Terminé, vérifié, commité |
| S01-BE-03 | BE | OpenAPI v0.1 : auth, catalogue, lecture | Terminé, vérifié, commité |
| S01-A1-01 | A1 | Squelette multi-module Android | Terminé, vérifié, commité |
| S01-A1-02 | A1 | Hilt, Retrofit, thème M3, Navigation Compose | Terminé, vérifié, commité |
| S01-A2-01 | A2 | Spike lecteur Media3 + HLS, préchargement | Terminé, vérifié, commité |
| S01-A2-02 | A2 | Rapport de spike : démarrage, mémoire | Terminé, vérifié, commité |
| S03-WEB-01 | WEB | Squelette Nuxt 3 back-office (avancé du sprint 3) | Terminé, vérifié, commité |
| S03-WEB-02 | WEB | Login admin + TOTP, côté interface (avancé du sprint 3) | Terminé, vérifié, commité |

## Tickets qui dépendent du client ou de prestataires

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S01-PM-01 | Ateliers de cadrage | Planifier 2 ateliers avec les parties prenantes |
| S01-PM-03 | Comparatif fournisseurs vidéo | Décision attendue au sprint 2 ; critère clé : DRM Widevine et points de présence en Afrique de l'Ouest |
| S01-UX-01 / 02 | Design system et wireframes | Désigner le designer UX/UI |
| S01-EXT-01 | Compte Play Console | Créer le compte développeur et lancer la vérification d'identité dès maintenant (plusieurs semaines) |
| S01-EXT-02 | Projet Firebase | Créer le projet, activer FCM, Analytics, Crashlytics, Remote Config, App Check |
| S01-EXT-03 | AdMob et agrégateur mobile money | Ouvrir le compte AdMob ; demander un accès sandbox à CinetPay, FedaPay ou PayDunya |
| S01-EXT-04 | Juridique | Saisir un conseil pour le lien de paiement externe et la déclaration IPDCP |
| S01-OPS-03 | Hébergement | Choisir l'hébergeur (Hetzner, OVH, Contabo ou cloud) et réserver le nom de domaine |

## Décisions prises par le développeur en chef

- **Monorepo** plutôt que trois dépôts : un seul historique, une CI par lot déclenchée sur les chemins modifiés. Scindable plus tard si l'équipe grossit.
- **Prisma** retenu comme ORM (le cahier des charges laissait le choix entre Prisma et TypeORM) pour les migrations versionnées et le typage.
- **Retrofit + OkHttp** retenus côté Android (le cahier des charges laissait Ktor en option) ; le module réseau est isolé pour permettre un passage à Ktor lors de la migration Kotlin Multiplatform.
- **Web avancé** : le squelette du back-office démarre au sprint 1 car le développeur web n'a pas de ticket avant le sprint 3.
- **JDK 17** installé localement dans le dossier utilisateur pour le build Android, le système n'ayant qu'un JDK 11.

## Points d'intégration à traiter au sprint 3

- Le back-office appelle `POST /admin/auth/login`, `POST /admin/auth/totp/verify`, `GET /admin/auth/me`, `POST /admin/auth/logout` et `GET /admin/series` (contrat dans `web/layers/base/types/api.ts`). Le backend expose pour l'instant ces routes en 501 ; S03-BE-01 et S03-BE-04 doivent implémenter ce contrat ou le faire corriger côté web.
- PrimeVue 4 retenu ; PrimeVue 5 introduit une dépendance de licence à évaluer avant migration.
- Vitest remplace Jest côté backend (NestJS 12 est ESM) ; la stack qualité du cahier des charges mentionnait Jest pour Android seulement, pas de déviation.

## Spike lecteur : mesures du 28 octobre 2026

Téléphone TECNO CM6 en Wi-Fi, épisodes verticaux 9:16 servis par le MinIO du PC de dev, Media3 1.11 avec DefaultPreloadManager.

| Mesure | Valeur |
| --- | --- |
| Premier épisode, démarrage à froid, première image | 899 ms |
| Deuxième épisode, préchargé, première image | 307 ms |
| Objectif M-12 (4G réelle) | < 1 500 ms, à mesurer sur réseau mobile au sprint 2 |

Les flux publics de test (Mux, Apple) sont en 16:9 : ils ont été remplacés par des épisodes 1080x1920 générés
par `infra/media-samples/generate.sh`. Le lecteur remplit l'écran (`ContentScale.Crop`).

## Points d'attention Android

- compileSdk 36 avec versions AndroidX épinglées : les versions les plus récentes exigent android-37, non installé sur le poste.
- AGP 9.5 et Gradle 9.8 : Android Studio doit être une version récente.
- R8 désactivé en release pour l'instant (S06-A2-03).

## Compte rendu de fin de sprint

À compléter à la démo.
