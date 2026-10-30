# Sprint 6 — Jalon 1 et début de la monétisation (semaines 11-12)

Démarré le 30 octobre 2026. Objectif : clore le lot « regarder » (défauts de recette, finitions, démonstration
du jalon 1) et, en avance du sprint 7, livrer portefeuille, déblocage, boutique et achats Google Play.

Contrat partagé : `docs/api/contract-v1.4-sprint6.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| DEF-002..009 | BE/WEB/A | Défauts mineurs de la recette du 30 octobre | DEF-002 à 009 corrigés ; DEF-011 et DEF-012 (nouveaux, mineurs) pour le sprint 7 |
| B-13+ | BE | `current` sur les appareils de confiance | Terminé, vérifié, commité |
| S07-BE-01 à 05 | BE | Grand livre, portefeuille, déblocage atomique et idempotent, déblocage automatique, paramètres de monétisation (avancé) | Terminé, vérifié, commité |
| S07-BE-06, 07 | BE | Vérification des achats Google Play, RTDN, abonnements (avancé) | Terminé, vérifié, commité (vérificateur simulé en dev) |
| B-06, B-08, B-09 | BE/WEB | Monétisation, barème des récompenses, utilisateurs et support (avancé) | Terminé, vérifié, commité |
| S07-A1-01 à 03 | A1 | Paywall, déblocage par pièces et automatique, portefeuille (avancé) | Terminé, vérifié, commité |
| S07-A2-01 à 03 | A2 | Google Play Billing, boutique, achat de pack (avancé ; facturation simulée en debug) | Terminé, vérifié, commité |
| S06-QA-01 | QA | Recette complète du lot « regarder » et du compte, sur le téléphone et les émulateurs | Terminé sur 2 émulateurs ; téléphone non disponible pour la recette |
| S06-QA-02 | QA | Rapport de recette du jalon 1 | Terminé : GO sous réserve |
| S06-PM-01 | PM | Démonstration du jalon 1 : scénario et préparation | Scénario rédigé (`docs/jalon-1/scenario-demo.md`) ; séance à planifier avec le client |

## Tickets qui dépendent du client

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S07-EXT-01 | Google Play | Compte développeur vérifié, produits créés (packs de pièces, formules VIP) avec les mêmes identifiants que dans le back-office ; piste interne publiée pour tester la facturation réelle |
| S07-BE-06 | Google Play Developer API | Compte de service lié à la Play Console (en attendant, vérificateur simulé) |
| S06-BE-01 | Firebase | Compte de service pour les push réels |
| S06-PM-02 | Contenu | Démarrer l'ingestion du catalogue de lancement |
| S04-A1-03 | Domaine | Nom de domaine pour les liens de partage |

## Compte rendu de fin de sprint (30 octobre 2026)

Jalon 1 atteint sur le périmètre fonctionnel : recette « GO sous réserve », aucun défaut bloquant ni majeur, démonstration prête.
En plus, l'essentiel du sprint 7 (monétisation) est livré en avance.

| Lot | Livré | Tests |
| --- | --- | --- |
| Backend | Grand livre, portefeuille, déblocage, déblocage automatique, boutique, achats Google Play et RTDN, monétisation, barème, fiche utilisateur, défauts de recette | 214 unitaires, 47 e2e |
| Web | Monétisation, récompenses, utilisateurs, étape TOTP | 199 Vitest |
| Android | Paywall, déblocage, portefeuille, boutique, facturation simulée et Play Billing, bannière de session | Suite verte, parcours réel sur émulateur et sur le téléphone du client |
| Recette | Campagne jalon 1 : 123 cas, 118 OK, 5 écarts mineurs ; rapport client | |

Réserves du jalon 1 : couverture 2 appareils sur 8 exigés ; démarrage à froid à confirmer sur un vrai 2 Go ; parcours 4G réelle à faire.

Reste pour le sprint 7 : facturation Google Play réelle (produits Play Console, piste interne), pub récompensée et check-in (sprint 8),
mobile money (sprint 9), DEF-011 et DEF-012, recette 3 avec les correctifs du jour.
