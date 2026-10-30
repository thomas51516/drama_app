# Sprint 7 — Récompenses, pub, recharge, offres (semaines 13-14)

Démarré le 30 octobre 2026. Les fournisseurs externes (Google Play, AdMob, agrégateur mobile money, Firebase) ne sont
pas encore disponibles : chaque intégration est livrée derrière un port avec une implémentation simulée en dev et une
implémentation réelle prête à configurer.

Contrat partagé : `docs/api/contract-v1.5-sprint7.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S08-BE-04, B-08 | BE | Check-in quotidien, tâches, administration des tâches | En cours |
| S08-BE-03 | BE | Pub récompensée : sessions, SSV AdMob et simulé, plafond, éligibilité | En cours |
| S10-BE-02, S10-BE-03, B-07 | BE | Déblocage de série entière, offre de bienvenue, offres limitées, codes promo | En cours |
| S09-BE-01, S09-BE-02 | BE | Commandes de recharge, webhooks mobile money simulé et CinetPay, réconciliation | En cours |
| M-04, DEF-012 | BE | Classements, genres localisés | En cours |
| S07-WEB-02 (suite), B-07 | WEB | Tâches de récompense, offres, codes promo | En cours |
| S09-WEB-01, S09-WEB-02 | WEB | Site de recharge mobile money (connexion, packs, paiement, confirmation, historique) | En cours |
| B-11 | WEB | Page de réconciliation des recharges | En cours |
| S08-A1-01 | A1 | Pub récompensée avec régie simulée et AdMob prêt (M-22) | En cours |
| S08-A1-02 | A1 | Check-in quotidien (M-40) et tâches (M-41) | En cours |
| S10-A1-01 | A1 | Déblocage de série entière (M-23), offre de bienvenue et codes promo (M-24) | En cours |
| S10-A1-02 | A2 | Classements (M-04) | En cours |
| S09-A2-01, 02 | A2 | Économie de données (M-17), protection des épisodes payants (M-18) | En cours |
| S09-A1-03 | A1 | Lien vers la recharge mobile money derrière Remote Config (M-34) | En cours |
| DEF-011, DEF-012 | A | Jeton push envoyé deux fois, genres non traduits | En cours |
| S07-QA-01 | QA | Campagne 3 : correctifs des défauts et parcours de monétisation (après les livraisons) | À lancer |

## Tickets qui dépendent du client

| Élément | Nécessaire pour | État |
| --- | --- | --- |
| Produits Play Console | Paiement Google réel | En attente, simulé |
| Compte AdMob approuvé et bloc d'annonce | Pub réelle | En attente, simulé |
| Agrégateur mobile money (CinetPay, FedaPay ou PayDunya) | Paiement mobile money réel | En attente, simulé |
| Compte de service Firebase | Push réels | En attente, journal |
| Hébergeur et domaine | Staging, liens, bêta | En attente |

## Compte rendu de fin de sprint

À compléter.
