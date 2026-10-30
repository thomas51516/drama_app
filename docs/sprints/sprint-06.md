# Sprint 6 — Jalon 1 et début de la monétisation (semaines 11-12)

Démarré le 30 octobre 2026. Objectif : clore le lot « regarder » (défauts de recette, finitions, démonstration
du jalon 1) et, en avance du sprint 7, livrer portefeuille, déblocage, boutique et achats Google Play.

Contrat partagé : `docs/api/contract-v1.4-sprint6.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| DEF-002..009 | BE/WEB/A | Défauts mineurs de la recette du 30 octobre | DEF-002/003/004/005/008/009 corrigés ; DEF-006/007 côté Android en cours |
| B-13+ | BE | `current` sur les appareils de confiance | Terminé, vérifié, commité |
| S07-BE-01 à 05 | BE | Grand livre, portefeuille, déblocage atomique et idempotent, déblocage automatique, paramètres de monétisation (avancé) | Terminé, vérifié, commité |
| S07-BE-06, 07 | BE | Vérification des achats Google Play, RTDN, abonnements (avancé) | Terminé, vérifié, commité (vérificateur simulé en dev) |
| B-06, B-08, B-09 | BE/WEB | Monétisation, barème des récompenses, utilisateurs et support (avancé) | Terminé, vérifié, commité |
| S07-A1-01 à 03 | A1 | Paywall, déblocage par pièces et automatique, portefeuille (avancé) | En cours |
| S07-A2-01 à 03 | A2 | Google Play Billing, boutique, achat de pack (avancé ; facturation simulée en debug) | En cours |
| S06-QA-01 | QA | Recette complète du lot « regarder » et du compte, sur le téléphone et les émulateurs | En cours |
| S06-QA-02 | QA | Rapport de recette du jalon 1 | En cours |
| S06-PM-01 | PM | Démonstration du jalon 1 : scénario et préparation | À faire par le développeur en chef |

## Tickets qui dépendent du client

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S07-EXT-01 | Google Play | Compte développeur vérifié, produits créés (packs de pièces, formules VIP) avec les mêmes identifiants que dans le back-office ; piste interne publiée pour tester la facturation réelle |
| S07-BE-06 | Google Play Developer API | Compte de service lié à la Play Console (en attendant, vérificateur simulé) |
| S06-BE-01 | Firebase | Compte de service pour les push réels |
| S06-PM-02 | Contenu | Démarrer l'ingestion du catalogue de lancement |
| S04-A1-03 | Domaine | Nom de domaine pour les liens de partage |

## Compte rendu de fin de sprint

À compléter.
