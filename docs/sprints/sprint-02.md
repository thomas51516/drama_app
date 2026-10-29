# Sprint 2 — Fondations (semaines 3-4)

Démarré le 28 octobre 2026. Objectif : socle complet, compte invité relié au backend, lecteur vertical finalisé,
chaîne d'ingestion vidéo utilisable de bout en bout en local.

Contrat partagé : `docs/api/admin-contract-v1.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S02-OPS-02 | OPS | Sentry (optionnel par DSN), métriques Prometheus, compose de supervision | Terminé, vérifié, commité |
| S02-BE-01 | BE | Auth invité et refresh | Terminé au sprint 1 |
| S02-BE-02 | BE | Limitation de débit sur `/auth/*` | Terminé, vérifié, commité |
| S02-BE-03 | BE | OpenAPI v1 complète (tous les endpoints publics avec DTO) | Terminé, vérifié, commité |
| S02-BE-04 | BE | Stockage objet : URL pré-signée d'upload | Terminé, vérifié, commité |
| S02-BE-05 | BE | Transcodage : worker ffmpeg local + webhook fournisseur | Terminé, vérifié, commité |
| S03-BE-01 | BE | Admin séries (avancé) | Terminé, vérifié, commité |
| S03-BE-02 | BE | Admin épisodes et upload (avancé) | Terminé, vérifié, commité |
| S03-BE-04 | BE | Auth admin + TOTP (avancé) | Terminé, vérifié, commité |
| S02-A1-01 | A1 | Couche réseau branchée sur l'API réelle, erreurs et retry | Terminé, vérifié, commité |
| S02-A1-02 | A1 | Compte invité au premier lancement, session DataStore | Terminé, vérifié, commité |
| S02-A1-03 | A1 | Room : progression, historique, cache catalogue | Terminé, vérifié, commité |
| S02-A1-04 | A1 | Firebase Crashlytics et Analytics (conditionnel au fichier google-services.json) | Terminé, vérifié, commité |
| S02-A2-01 | A2 | VerticalPager | Terminé au sprint 1 |
| S02-A2-02 | A2 | Préchargement et SimpleCache | Terminé au sprint 1 |
| S02-A2-03 | A2 | Contrôles : pause, avance/retour, barre de progression | Terminé, vérifié, commité |
| S03-WEB-03 | WEB | Catalogue : création et édition de série (avancé) | Terminé, vérifié, commité |
| S04-WEB-01 | WEB | Upload direct des épisodes avec progression (avancé) | Terminé, vérifié, commité |

## Tickets qui dépendent du client ou de prestataires

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S02-PM-01 | Décisions fournisseur vidéo, OTP, régie, DRM | À acter en fin de sprint 2 |
| S02-PM-03 | CGU, CGV, confidentialité | Brief au juriste |
| S02-UX-01 | Maquettes haute fidélité | Designer |
| S02-OPS-01 | CI/CD vers staging | Bloqué : hébergeur et domaine |
| S02-A1-04 | Firebase | Terminé, vérifié, commité |
| S02-EXT-01 | Fournisseur vidéo | En attendant, épisodes de test locaux et worker ffmpeg |

## Décisions prises par le développeur en chef

- **Transcodage local par ffmpeg en dev** : permet de tester l'ingestion de bout en bout sans fournisseur. L'adaptateur fournisseur géré reste prévu derrière le même port.
- **Admin auth et catalogue avancés au sprint 2** : le web n'avait aucun backend à consommer.
- **Pas de serveur de mocks séparé** : l'app Android consomme directement le backend local, les exemples OpenAPI servent de référence.

## Ingestion vidéo de bout en bout (28 octobre 2026)

Vérifié sur le poste de dev : connexion admin avec TOTP, création de série et d'épisode dans le back-office,
upload direct d'un fichier 1080x1920 vers MinIO par URL pré-signée, transcodage par le worker ffmpeg local,
statut READY après 4 s, manifeste HLS en 4 qualités servi par MinIO. Pas de fournisseur vidéo nécessaire pour
développer les sprints 3 à 6.

## Compte rendu de fin de sprint (29 octobre 2026)

Tous les tickets techniques du sprint 2 sont livrés, vérifiés et poussés, plus cinq tickets avancés des sprints 3 et 4.

| Lot | Livré | Tests |
| --- | --- | --- |
| Backend | Auth admin TOTP, limitation de débit, catalogue admin, upload pré-signé, transcodage ffmpeg, OpenAPI v1 à 44 routes, métriques | 65 unitaires, 12 e2e, ingestion réelle jusqu'à READY |
| Web | Fiche série complète, page épisodes avec upload en masse, suivi du transcodage, aperçu HLS | 55 Vitest, parcours réel validé jusqu'à l'upload |
| Android | Session invité chiffrée, API réelle, cache Room, accueil et lecteur branchés au backend, contrôles complets, Firebase | 50 unitaires, migration instrumentée, parcours réel sur TECNO CM6 |

Mesures lecteur sur téléphone contre le backend local : 938 ms à froid, 516 ms préchargé, reprise à la position serveur après fermeture forcée.

Points reportés : upload reprenable (multipart) au sprint 4, Loki au staging, mapping d'un fournisseur de transcodage géré après S02-PM-01.
