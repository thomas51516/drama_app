# Sprint 4 — Lecture complète et identité (semaines 7-8)

Démarré le 29 octobre 2026. Objectif : flux « Pour vous », lecture par URL signée, partage par lien, et, en avance
du sprint 5, connexion Google, OTP et e-mail avec rattachement du compte invité, favoris, recherche.

Contrat partagé : `docs/api/public-contract-v1.2.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S04-BE-02 | BE | URL de manifeste signée et expirante, port de signature | En cours |
| S04-BE-03 | BE | Flux : extraits signés, épisode et favori | En cours |
| S05-BE-01 à 03 | BE | Connexion Google, OTP, e-mail, rattachement et fusion de l'invité (avancé) | En cours |
| S05-BE-04 | BE | `/me`, suppression différée (avancé) | En cours |
| S05-BE-05 | BE | Favoris et J'aime (avancé) | En cours |
| S05-BE-06 | BE | Recherche plein texte et suggestions (avancé) | En cours |
| B-04 / B-11 | BE | Publication programmée et statistiques v0 (avancé) | En cours |
| S04-WEB-xx | WEB | Upload, transcodage, sous-titres | Terminés |
| B-04 | WEB | Planification : dates de publication, calendrier des sorties (avancé) | Terminé, vérifié, commité |
| B-11 v0 | WEB | Tableau de bord : utilisateurs actifs, top séries, épisodes vus (avancé) | Terminé, vérifié, commité |
| S06-WEB-02 | WEB | Guide back-office v1 (avancé) | Terminé, vérifié, commité |
| S04-A1-01 | A1 | Flux vertical « Pour vous » M-02 | En cours |
| S04-A1-02 | A1 | Continuer à regarder | Terminé au sprint 3 |
| S04-A1-03 | A1 | Partage par lien profond, App Links M-16 | En cours |
| S04-A2-01 | A2 | Lecture via URL signée, rafraîchissement à expiration | En cours |
| S04-A2-02 à 04 | A2 | Enchaînement, coupures réseau, reprise cross-device | Terminés |
| S05-A1-01 | A1 | Recherche M-03 (avancé) | En cours |
| S05-A1-02 | A1 | Ma liste et J'aime M-16 (avancé) | En cours |
| S05-A2-01 | A2 | Connexion Google, OTP, e-mail M-51 (avancé) | En cours |
| S05-A2-02 | A2 | Rattachement du compte invité M-50 (avancé) | En cours |

## Tickets qui dépendent du client

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S05-BE-01 | Connexion Google | Créer un identifiant OAuth « Web » et « Android » (SHA-1) dans Google Cloud, fournir `GOOGLE_CLIENT_IDS` |
| S05-BE-02 | OTP SMS | Choisir un fournisseur SMS couvrant le Togo, la Côte d'Ivoire et le Sénégal ; en attendant, mode console |
| S04-A1-03 | App Links | Réserver le nom de domaine ; `assetlinks.json` à publier dessus |
| S04-PM-01, S04-UX-01 | Spécifications récompenses, maquettes | Ateliers et designer |

## Compte rendu de fin de sprint

À compléter.
