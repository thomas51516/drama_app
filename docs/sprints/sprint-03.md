# Sprint 3 — Catalogue (semaines 5-6)

Démarré le 29 octobre 2026. Objectif : l'éditeur gère tout le catalogue dans le back-office, l'application affiche
un vrai accueil et une vraie fiche série, le lecteur gère sous-titres, vitesse et qualité.

Contrat partagé : `docs/api/admin-contract-v1.md` (addendum v1.1).

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S03-OPS-01 | OPS | AAB signé par configuration d'environnement, distribution interne Firebase App Distribution dans la CI | En cours |
| S03-BE-01 | BE | Admin séries | Terminé au sprint 2 |
| S03-BE-02 | BE | Admin épisodes | Terminé au sprint 2 |
| S03-BE-03 | BE | Sous-titres : import SRT/VTT, conversion, stockage, exposition publique | En cours |
| S03-BE-04 | BE | Auth admin | Terminé au sprint 2 |
| S04-BE-01 | BE | `/home` paramétré par la mise en avant, Tendances réelles, i18n des rangées (avancé) | En cours |
| S04-BE-04 | BE | Cache Redis du catalogue et invalidation (avancé) | En cours |
| S05-BE-xx | BE | Backend B-05 mise en avant et B-13 comptes internes et audit (avancé) | En cours |
| S03-WEB-01/02/03 | WEB | Squelette, login, catalogue | Terminés |
| S04-WEB-01/02 | WEB | Upload, suivi transcodage, réordonnancement | Terminés au sprint 2 |
| S04-WEB-03 | WEB | Sous-titres : import par langue, aperçu synchronisé (avancé) | En cours |
| S05-WEB-01 | WEB | Comptes internes, rôles, journal d'audit (avancé) | En cours |
| S05-WEB-02 | WEB | Mise en avant : bannières et rangées, par pays (avancé) | En cours |
| S03-A1-01 | A1 | Accueil M-01 réel et fiche série M-10 | En cours |
| S03-A2-01 | A2 | Sous-titres M-14 | En cours |
| S03-A2-02 | A2 | Vitesse et qualité M-13 | En cours |
| S03-A2-03 | A2 | Reprise M-15 | Terminé au sprint 2 |

## Tickets qui dépendent du client

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S03-PM-01 | Spécifications monétisation | Ateliers prix et packs |
| S03-UX-01/02 | Maquettes boutique, portefeuille, compte, back-office | Designer : l'app utilise un thème sombre provisoire en attendant |
| S02-PM-01 | Décisions fournisseur vidéo, OTP, régie, DRM | Toujours attendues |
| S03-OPS-01 | Clé de signature et compte de service Firebase App Distribution | À fournir pour activer la distribution interne |

## Compte rendu de fin de sprint

À compléter.
