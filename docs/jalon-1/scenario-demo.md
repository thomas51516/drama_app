# Jalon 1 — Scénario de démonstration

Objectif du jalon (cahier des charges §15) : une série réelle se regarde de bout en bout, publiée depuis le back-office
sans intervention technique, et l'application offre le parcours complet « découvrir, regarder, reprendre, se connecter ».
Durée visée : 25 minutes. Deux écrans : le back-office sur le PC, l'application sur le téléphone du client en miroir.

## Préparation (la veille)

- Services démarrés : base, Redis, MinIO, API, back-office, sauvegarde quotidienne active.
- Téléphone sur le même Wi-Fi que le PC, données mobiles coupées, dernière version installée.
- Une vraie série du catalogue de lancement prête à être téléversée : 5 épisodes verticaux MP4, affiche verticale,
  un fichier de sous-titres SRT. À défaut, les épisodes de test 9:16 générés par `infra/media-samples`.
- Compte back-office éditeur, appareil de confiance déjà enregistré pour éviter le code à l'écran.

## Déroulé

| Temps | Écran | Ce que l'on montre | Référence |
| --- | --- | --- | --- |
| 0-3 min | Back-office | Créer la série : titre, synopsis, genres, classification, affiche. Elle est en brouillon. | B-01 |
| 3-8 min | Back-office | Déposer les 5 épisodes d'un coup ; progression ; statuts « En traitement » puis « Prêt » en quelques secondes ; aperçu d'un épisode ; import du sous-titre. | B-02, B-03 |
| 8-10 min | Back-office | Publier la série ; composer l'accueil : bannière et rangée « Nouveautés » ; aperçu pour le Togo et la Côte d'Ivoire. | B-05 |
| 10-12 min | Téléphone | L'accueil affiche la bannière et la série ; fiche série avec grille d'épisodes ; lecture plein écran, image entière, démarrage immédiat. | M-01, M-10, M-11, M-12 |
| 12-15 min | Téléphone | Balayage vers l'épisode suivant ; sous-titres, vitesse, qualité ; fermer l'app, la rouvrir : reprise à la seconde près ; flux « Pour vous ». | M-13, M-14, M-15, M-02 |
| 15-18 min | Téléphone | Recherche d'un titre ; ajout à Ma liste ; partage par lien ; passage de l'interface en anglais puis retour. | M-03, M-16, M-52 |
| 18-21 min | Téléphone | Création de compte par téléphone (code lu dans les logs en démo) : l'historique et la liste sont conservés ; déconnexion et reconnexion sur le même compte. | M-50, M-51 |
| 21-23 min | Les deux | Formulaire de contact depuis l'app ; réponse depuis le back-office ; la réponse arrive dans l'app. Programmer la sortie du 6e épisode à demain : il n'apparaît pas encore dans l'app. | M-53, B-04 |
| 23-25 min | Back-office | Tableau de bord : utilisateurs actifs, épisodes vus ; journal d'audit des actions de la démo ; rapport de recette du jalon 1 et mesures de performance. | B-11, B-13, §15.3 |

## Ce qui n'est pas montré au jalon 1, et pourquoi

- Paiement, pièces, VIP, pub récompensée : sprints 7 à 9, en cours de développement en avance.
- Notifications push réelles : le compte de service Firebase n'est pas encore fourni ; la file et l'historique in-app fonctionnent.
- Connexion Google sur le téléphone : à montrer si le client l'a essayée avec succès avant la séance.

## Décisions à prendre en séance

1. Fournisseur vidéo et CDN pour le staging (ticket S02-PM-01), fournisseur SMS, régie publicitaire, DRM.
2. Hébergeur et nom de domaine : conditionnent le staging, les liens de partage et la bêta.
3. Date de début de l'ingestion du catalogue de lancement et formation de l'équipe éditoriale.
4. Validation ou ajustement du thème provisoire en attendant le designer.
