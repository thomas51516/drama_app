# Sprint 1 — Cadrage et socle (semaines 1-2)

Démarré le 28 octobre 2026. Objectif : décisions préparées, dépôts et environnements prêts, lecteur HLS mesuré en 4G.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S01-OPS-01 | OPS | Dépôt git monorepo, CI lint + tests par lot | En cours |
| S01-OPS-02 | OPS | Docker Compose dev : PostgreSQL, Redis, MinIO | En cours |
| S01-OPS-03 | OPS | VPS staging, DNS, Traefik + TLS | Bloqué : nécessite un hébergeur et un nom de domaine |
| S01-BE-01 | BE | Squelette NestJS, config, healthcheck, Swagger | En cours |
| S01-BE-02 | BE | Modèle de données complet et migrations initiales | En cours |
| S01-BE-03 | BE | OpenAPI v0.1 : auth, catalogue, lecture | En cours |
| S01-A1-01 | A1 | Squelette multi-module Android | En cours |
| S01-A1-02 | A1 | Hilt, Retrofit, thème M3, Navigation Compose | En cours |
| S01-A2-01 | A2 | Spike lecteur Media3 + HLS, préchargement | En cours |
| S01-A2-02 | A2 | Rapport de spike : démarrage, mémoire | En cours |
| S03-WEB-01 | WEB | Squelette Nuxt 3 back-office (avancé du sprint 3) | En cours |
| S03-WEB-02 | WEB | Login admin + TOTP, côté interface (avancé du sprint 3) | En cours |

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

## Compte rendu de fin de sprint

À compléter à la démo.
