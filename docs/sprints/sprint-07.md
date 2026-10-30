# Sprint 7 — Récompenses, pub, recharge, offres (semaines 13-14)

Démarré le 30 octobre 2026. Les fournisseurs externes (Google Play, AdMob, agrégateur mobile money, Firebase) ne sont
pas encore disponibles : chaque intégration est livrée derrière un port avec une implémentation simulée en dev et une
implémentation réelle prête à configurer.

Contrat partagé : `docs/api/contract-v1.5-sprint7.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| S08-BE-04, B-08 | BE | Check-in quotidien, tâches, administration des tâches | Terminé, vérifié, commité |
| S08-BE-03 | BE | Pub récompensée : sessions, SSV AdMob et simulé, plafond, éligibilité | Terminé, vérifié, commité |
| S10-BE-02, S10-BE-03, B-07 | BE | Déblocage de série entière, offre de bienvenue, offres limitées, codes promo | Terminé, vérifié, commité |
| S09-BE-01, S09-BE-02 | BE | Commandes de recharge, webhooks mobile money simulé et CinetPay, réconciliation | Terminé, vérifié, commité |
| M-04, DEF-012 | BE | Classements, genres localisés | Terminé, vérifié, commité |
| S07-WEB-02 (suite), B-07 | WEB | Tâches de récompense, offres, codes promo | Terminé, vérifié, commité |
| S09-WEB-01, S09-WEB-02 | WEB | Site de recharge mobile money (connexion, packs, paiement, confirmation, historique) | Terminé, vérifié, commité |
| B-11 | WEB | Page de réconciliation des recharges | Terminé, vérifié, commité |
| S08-A1-01 | A1 | Pub récompensée avec régie simulée et AdMob prêt (M-22) | Terminé, vérifié, commité |
| S08-A1-02 | A1 | Check-in quotidien (M-40) et tâches (M-41) | Terminé, vérifié, commité |
| S10-A1-01 | A1 | Déblocage de série entière (M-23), offre de bienvenue et codes promo (M-24) | Terminé, vérifié, commité |
| S10-A1-02 | A2 | Classements (M-04) | Terminé, vérifié, commité |
| S09-A2-01, 02 | A2 | Économie de données (M-17), protection des épisodes payants (M-18) | Terminé, vérifié, commité |
| S09-A1-03 | A1 | Lien vers la recharge mobile money derrière Remote Config (M-34) | Terminé, câblé, désactivé par défaut |
| DEF-011, DEF-012 | A | Jeton push envoyé deux fois, genres non traduits | Corrigés |
| S07-QA-01 | QA | Campagne 3 : correctifs des défauts et parcours de monétisation (après les livraisons) | À lancer |

## Tickets qui dépendent du client

| Élément | Nécessaire pour | État |
| --- | --- | --- |
| Produits Play Console | Paiement Google réel | En attente, simulé |
| Compte AdMob approuvé et bloc d'annonce | Pub réelle | En attente, simulé |
| Agrégateur mobile money (CinetPay, FedaPay ou PayDunya) | Paiement mobile money réel | En attente, simulé |
| Compte de service Firebase | Push réels | En attente, journal |
| Hébergeur et domaine | Staging, liens, bêta | En attente |

## Compte rendu de fin de sprint (30 octobre 2026)

Tous les tickets techniques sont livrés, vérifiés et poussés. Lancé en partie sur Fable puis terminé sur Sonnet
après un arbitrage de budget de tokens avec le client en cours de sprint ; aucune perte de travail.

| Lot | Livré | Tests |
| --- | --- | --- |
| Backend | Récompenses, tâches, pub récompensée, déblocage de série entière, offres, codes promo, recharge mobile money, réconciliation, classements | 251 unitaires, 54 e2e |
| Web | Tâches, offres et promos, réconciliation, nouveau site de recharge | 266 Vitest |
| Android | Pub récompensée, check-in, tâches, déblocage de série, codes promo, classements, économie de données, protection FLAG_SECURE | Suite verte, parcours réel sur le téléphone du client |

Toutes les intégrations de fournisseurs externes (Google Play, AdMob, CinetPay, Firebase) sont derrière un port avec
une implémentation simulée en développement, refusée en production, et une implémentation réelle prête à configurer.

Reste pour les sprints suivants : brancher les vrais fournisseurs dès que le client les fournit, troisième campagne
de recette sur les livraisons du jour, démonstration du jalon 1, recette finale sur les appareils physiques restants.
