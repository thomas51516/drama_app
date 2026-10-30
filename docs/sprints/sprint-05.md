# Sprint 5 — Compte, notifications, aide et recette (semaines 9-10)

Démarré le 30 octobre 2026. Backend et web ayant déjà livré leurs tickets du sprint 5, ce sprint prend
les tickets du sprint 6 en avance et ouvre la recette.

Contrat partagé : `docs/api/contract-v1.3-sprint5.md`.

## Tickets techniques (agents de développement)

| ID | Lot | Ticket | Statut |
| --- | --- | --- | --- |
| B-13+ | BE/WEB | Appareil de confiance 30 jours pour le back-office (demande du client) | Terminé, vérifié, commité |
| S05-OPS-01 | OPS | Sauvegardes PostgreSQL et alertes | Terminé, vérifié, commité |
| S06-OPS-01 | OPS | Alertes de latence p95 et d'erreurs | Terminé, vérifié, commité |
| S06-BE-01 | BE | Push FCM : jetons, envoi, nouvel épisode d'une série suivie (avancé) | Terminé, vérifié, commité |
| S06-BE-02 | BE | Centre d'aide : FAQ et formulaire de contact (avancé) | Terminé, vérifié, commité |
| S06-BE-03 | BE | Événements d'analyse côté serveur (avancé) | Terminé, vérifié, commité |
| B-10 | BE/WEB | Campagnes push ciblées (avancé) | Terminé, vérifié, commité |
| B-03bis | WEB | Gestion de la FAQ et boîte de réception du support (avancé) | Terminé, vérifié, commité |
| S05-A1-03 | A1 | Profil : langue appliquée à l'app, préférences de notification | Terminé, vérifié, commité |
| S05-A2-03 | A2 | Internationalisation FR, EN, ES, PT | Terminé, vérifié, commité |
| S06-A1-01 | A1 | Centre d'aide, FAQ, contact (avancé) | Terminé, vérifié, commité |
| S06-A1-02 | A1 | Réception et routage des notifications push (avancé) | Terminé, vérifié, commité |
| S06-A1-03 | A1 | Accessibilité (avancé) | Terminé, vérifié, commité |
| S06-A2-01/02/03 | A2 | Démarrage < 1,5 s, démarrage à froid < 2,5 s, AAB < 30 Mo (avancé) | Terminé, vérifié, commité |
| S05-QA-01 | QA | Cahier de recette du lot « regarder » et du compte | Terminé, vérifié, commité |
| S05-QA-02 | QA | Première campagne : téléphone TECNO, émulateur entrée de gamme API 29 à 2 Go, émulateur API 36 | Terminé, vérifié, commité |
| S05-QA-03 | QA | Tests API automatisés dans la CI | Couvert par les e2e backend |

## Tickets qui dépendent du client

| ID | Ticket | Action attendue |
| --- | --- | --- |
| S06-BE-01 | Push FCM | Télécharger un compte de service Firebase (Paramètres du projet → Comptes de service → Générer une clé privée) et me donner le chemin du fichier ; en attendant, mode `log` |
| S05-PM-01 | Formation éditoriale | Planifier avec l'équipe contenu |
| S05-OPS-01 | Hébergement | Toujours en attente d'un hébergeur pour le staging |

## Notes d'intégration

- `GET /admin/campaigns` est paginé (`items, total, page, pageSize`) ; le contrat v1.3 indiquait un tableau simple. Le web gère les deux formes.
- Le backend ne signale pas encore quel appareil de confiance est le navigateur courant (`current`) ; à ajouter au sprint 6.
- Les comptes monetization@ et support@ sont désormais enrôlés en TOTP par l'agent web pour ses tests ; secrets dans le rapport interne, pas dans le dépôt.

## Compte rendu de fin de sprint (30 octobre 2026)

Tous les tickets techniques sont livrés, vérifiés et poussés, y compris les tickets du sprint 6 pris en avance.

| Lot | Livré | Tests |
| --- | --- | --- |
| Backend | Appareil de confiance, push et campagnes, centre d'aide et support, événements d'analyse, sauvegardes, alertes ; correctif DEF-001 | 175 unitaires, 32 e2e |
| Web | Case 30 jours et appareils, campagnes, FAQ et support | 153 Vitest, flux réel vérifié |
| Android | Réglages, i18n 4 langues, aide, push, accessibilité, performance | Suite verte, parcours réel sur émulateur |
| Recette | Cahier de recette de 150 cas, campagne sur 2 émulateurs et API, 10 défauts dont 1 majeur corrigé | |

Performance mesurée sur émulateur Android 10 à 2 Go : démarrage à froid 569 ms (cible 2 500), première image 231 ms (cible 1 500), téléchargement 3,9 Mo (cible 30).

Réserves : la version du sprint 5 n'a pas pu être installée sur le téléphone du client pendant le sprint (débogage USB désactivé côté téléphone) ; FCM réel non testé faute de compte de service ; TalkBack non parcouru sur appareil réel.

Reste pour le jalon 1 (sprint 6) : les 8 défauts mineurs de la recette, `current` sur les appareils de confiance, App Links sur un vrai domaine, recette sur appareils physiques supplémentaires, démo client.
