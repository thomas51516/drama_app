# Guide du back-office DRAMA (v1)

Ce guide s'adresse à l'équipe éditoriale et aux personnes qui administrent le back-office de
DRAMA, l'application de micro-séries verticales. Il décrit, écran par écran, comment publier une
série de A à Z : connexion, catalogue, épisodes, sous-titres, mise en avant, planification des
sorties, tableau de bord, comptes internes. Il est aussi accessible depuis le bouton **Aide** de
la barre du haut.

> Règle d'or : le serveur fait foi. Les prix, les droits et les dates de publication sont appliqués
> par l'API ; le back-office ne fait que les saisir. En cas de doute, rechargez la page : ce que vous
> voyez après rechargement est l'état réel.

## Connexion et double authentification

1. Ouvrez l'adresse du back-office (en développement : `http://localhost:3100`).
2. Saisissez votre **adresse e-mail** et votre **mot de passe**, puis « Se connecter ».
3. Saisissez le **code à 6 chiffres** de votre application d'authentification (Google
   Authenticator, Authy, Microsoft Authenticator…). Le code change toutes les 30 secondes ; un code
   qui vient d'expirer reste accepté quelques secondes.
4. **Première connexion** : l'écran affiche un QR code et une clé secrète. Scannez le QR code avec
   votre application d'authentification (ou saisissez la clé à la main), puis entrez le code
   affiché. Cette étape enrôle votre téléphone : conservez-le, il sera demandé à chaque connexion.

Points à connaître :

- La session dure **8 heures** ; au-delà, vous êtes renvoyé vers la page de connexion (votre travail
  enregistré n'est pas perdu).
- Après **5 tentatives** de mot de passe erroné en 15 minutes, le compte est temporairement
  bloqué : attendez un quart d'heure.
- Téléphone perdu ou changé : demandez à un administrateur de **réinitialiser la double
  authentification** (page Administration) ; vous referez l'enrôlement à la connexion suivante.
- Pour quitter, utilisez le bouton **Déconnexion** en haut à droite, surtout sur un poste partagé.

### Rôles

| Rôle           | Ce qu'il peut faire                                                           |
| -------------- | ----------------------------------------------------------------------------- |
| Éditeur        | Créer et modifier séries, épisodes, sous-titres, mise en avant, planification |
| Monétisation   | Modifier les épisodes gratuits et le coût par épisode ; le reste en lecture   |
| Support        | Tout consulter, rien modifier                                                 |
| Administrateur | Tout, plus les comptes internes et le journal d'audit                         |

Le rôle de votre compte est affiché sous votre nom, en haut à droite. Un bouton grisé ou un message
« Droits insuffisants » signifie que l'action n'est pas ouverte à votre rôle.

## Séries (catalogue)

Menu **Catalogue**. La liste montre toutes les séries avec leur statut : **Brouillon** (invisible
dans l'application), **Publiée**, **Archivée** (retirée de l'application). Les filtres par statut et
la recherche par titre sont conservés dans l'adresse de la page : vous pouvez partager le lien.

### Créer une série

1. « Nouvelle série », puis remplissez le formulaire :
   - **Titre** (2 à 120 caractères) et **synopsis** (2 000 caractères au plus) ;
   - **Genres** (au moins un) et **tags** libres (Entrée pour valider chaque tag) ;
   - **Langue** de la série et **classification d'âge** (tous publics, -12, -16, -18) ;
   - **Territoires autorisés** : codes pays ; liste vide = disponible partout. Le raccourci
     « + Francophonie » ajoute les pays francophones d'un coup ;
   - **Affiches** : verticale (2:3, utilisée dans les rangées de l'accueil) et horizontale (16:9).
     JPEG, PNG ou WebP. L'image est envoyée directement au stockage ; l'aperçu apparaît aussitôt.
2. « Créer la série » : elle est créée en **brouillon** avec le lien « Épisodes » prêt à l'emploi.

Les champs **Épisodes gratuits** et **Coût par épisode** sont réservés aux rôles Monétisation et
Administrateur ; pour les autres rôles ils sont verrouillés (cadenas).

### Publier, archiver

- **Publier** rend la série visible dans l'application. La publication est **refusée tant
  qu'aucun épisode n'est « Prêt »** (transcodé) : ajoutez et attendez le transcodage d'au moins un
  épisode.
- **Archiver** la retire de l'application ; ses champs deviennent non modifiables. Une série
  archivée peut être republiée.
- La date de **Publication programmée** (bloc « Planification » de la fiche) permet de préparer
  une sortie à l'avance : voir la section Planification.

## Épisodes et upload

Menu **Épisodes** (choisissez la série), ou bouton « Épisodes » depuis une fiche série.

### Ajouter des épisodes

1. Glissez vos fichiers vidéo dans la zone « Ajouter des épisodes » (ou cliquez pour parcourir).
   Formats **MP4 ou MOV**, **2 Go maximum** par fichier. Vous pouvez déposer plusieurs fichiers à la
   fois : un épisode est créé par fichier, **numéroté automatiquement** à la suite des épisodes
   existants, et le titre reprend le nom du fichier sans extension.
2. La **file d'envoi** montre la progression de chaque fichier (3 envois simultanés au plus) et la
   progression globale. En cas d'échec réseau, « Relancer » reprend l'envoi sans recréer
   l'épisode. **Ne quittez pas la page pendant un envoi** : un avertissement s'affiche si vous
   essayez.
3. Une fois le fichier reçu, l'épisode passe par les statuts **Envoyé** → **Transcodage** →
   **Prêt**. La liste se rafraîchit toute seule toutes les 5 secondes pendant le transcodage.
   Comptez quelques minutes par épisode selon sa durée.
4. **Échec** : le message d'erreur s'affiche sous le titre ; « Relancer le transcodage » remet
   l'épisode en file. Si l'échec persiste, vérifiez le fichier source (codec, durée, fichier
   tronqué) et renvoyez-le.

Conseil : nommez vos fichiers `01 - Titre.mp4`, `02 - Titre.mp4`… l'ordre de dépôt n'est pas
garanti, mais vous pourrez toujours réordonner ensuite.

### Gérer la liste

- **Renommer** : crayon à côté du titre (ou double-clic), Entrée pour valider, Échap pour annuler.
- **Réordonner** : glissez la poignée à gauche d'une ligne ; les numéros sont recalculés et
  enregistrés immédiatement.
- **Aperçu** : bouton lecture sur un épisode « Prêt » ; le lecteur propose les sous-titres de
  l'épisode pour vérifier leur calage.
- **Supprimer** : poubelle, avec confirmation. Les fichiers associés sont supprimés ; les épisodes
  suivants sont renumérotés.
- La colonne **Publication** montre la date de sortie de l'épisode (voir Planification) ; une date
  future apparaît sous la forme **« Programmé le … »**.

## Sous-titres

Depuis la page Épisodes, bouton **Sous-titres** (icône langue) sur un épisode « Prêt », ou menu
**Sous-titres** de la barre latérale puis choix de la série.

1. Choisissez la **langue** (français, anglais, espagnol, portugais, ou un autre code à deux
   lettres) et le fichier **.srt** ou **.vtt** (2 Mo au plus).
2. « Ajouter » : le fichier SRT est converti en VTT par le serveur. **Une seule piste par langue** :
   réimporter la même langue remplace la piste existante.
3. Vérifiez le calage avec l'**aperçu** : lancez la lecture puis sélectionnez la langue dans le
   lecteur.
4. La corbeille supprime une piste (avec confirmation).

Les sous-titres sont disponibles dans l'application dès l'import, sans republier l'épisode.

## Mise en avant (accueil de l'application)

Menu **Mise en avant**. L'accueil de l'application est composé de **bannières** (grand visuel en
haut) puis de **rangées** de séries. Chaque élément peut être limité à certains **pays** (liste vide
= partout).

### Bannières

- « Nouvelle bannière » : série mise en avant, image 16:9, titre, sous-titre, pays, **période de
  diffusion** facultative (début, fin) et interrupteur **Actif**.
- L'état de diffusion est calculé automatiquement : **en ligne**, **programmée** (début à venir),
  **terminée** (fin passée) ou **désactivée**.
- Glissez les lignes pour changer l'ordre d'affichage.

### Rangées

- Types : **Manuelle** (liste de séries ordonnée à la main), **Tendances** (les plus regardées sur
  7 jours), **Nouveautés**, **Genre** (toutes les séries publiées d'un genre), **Continuer à
  regarder** (propre à chaque utilisateur).
- Le **titre** est obligatoire en français, facultatif dans les autres langues (repli sur le
  français). La **clé technique** est proposée automatiquement ; ne la changez que si vous savez
  pourquoi (elle identifie la rangée dans l'application).
- Glissez les lignes pour changer l'ordre ; désactivez une rangée pour la retirer sans la supprimer.

### Aperçu

L'onglet **Aperçu** affiche l'accueil tel que le verrait un utilisateur d'un pays et d'une langue
donnés, dans un cadre téléphone. Seules les séries **publiées** (et dont la date de publication est
atteinte) y apparaissent : une série en brouillon dans une rangée manuelle est simplement ignorée.
L'application reçoit les changements dans la minute (cache de 60 secondes).

## Planification des sorties

Menu **Planification** : calendrier (vue **Mois**) ou agenda (vue **Liste**, 90 prochains jours) de
toutes les sorties programmées, séries et épisodes confondus. Un clic sur un élément ouvre la fiche
série ou la page des épisodes.

Toutes les heures sont affichées et saisies en **heure de Lomé** (Africa/Lome, UTC+0) et
enregistrées en UTC par le serveur ; vous n'avez pas de conversion à faire.

### Programmer une série

Dans la fiche série, bloc **Planification** → **Publication programmée** : choisissez la date et
l'heure, puis « Enregistrer ». Tant que la date n'est pas atteinte, la série reste invisible dans
l'application même si son statut est « Publiée ». Videz le champ pour revenir à une publication
manuelle.

### Programmer un épisode

Page Épisodes, colonne **Publication** : l'icône calendrier (visible au survol) ouvre la date de
publication de l'épisode. Avant cette date, l'épisode n'est pas proposé dans l'application
(l'épisode suivant n'est tout simplement pas listé). « Retirer la date » le rend disponible dès que
la série est publiée.

### Planifier une sortie quotidienne

Pour les séries publiées au rythme d'un ou plusieurs épisodes par jour :

1. Page Épisodes → **« Planifier une sortie quotidienne »**.
2. Choisissez le **premier jour**, l'**heure de sortie** et le nombre d'**épisodes par jour**.
3. Cochez les épisodes concernés. Seuls les épisodes **En attente** ou **Prêts** sont proposés ; les
   épisodes en transcodage ou en échec sont exclus (relancez-les, puis planifiez-les ensuite). Un
   avertissement signale les épisodes qui ont déjà une date : elle sera remplacée.
4. Vérifiez l'**aperçu du calendrier** (jour J+0, J+1… avec la date exacte de chaque épisode), puis
   confirmez. Les dates sont enregistrées épisode par épisode ; en cas d'échec partiel, relancez
   simplement pour les épisodes restants.

À l'heure dite, le serveur rend l'épisode disponible et envoie les notifications ; aucune action
n'est nécessaire côté back-office.

## Tableau de bord

Menu **Tableaux de bord** (version 0). Les chiffres sont calculés par le serveur à partir des
comptes et des lectures, mis en cache 5 minutes et **actualisés automatiquement toutes les
5 minutes** (bouton « Actualiser » pour forcer).

- **Utilisateurs** : actifs sur 24 h, 7 jours et 30 jours (fenêtres glissantes), nouveaux
  utilisateurs sur la période, comptes inscrits et invités (avec leur part).
- **Visionnage** : épisodes commencés, épisodes terminés et **taux de complétion** (terminés ÷
  commencés) sur la période. Le taux est « — » quand aucun épisode n'a été commencé.
- **Top séries** : spectateurs et épisodes terminés par série, en graphique et en tableau (le
  tableau est la référence ; le titre renvoie vers la fiche série).
- Le sélecteur **7 / 30 derniers jours** s'applique aux nouveaux utilisateurs, au visionnage et au
  top séries.

Les revenus par source, la rétention par épisode et la conversion au paywall arriveront avec la
monétisation.

## Comptes internes et journal d'audit

Menu **Administration**, réservé aux administrateurs.

### Comptes

- **Créer un compte** : e-mail, nom affiché, rôle, mot de passe (généré ou saisi : 12 caractères au
  moins, majuscules, minuscules et chiffre). Le mot de passe est **affiché une seule fois** :
  copiez-le et transmettez-le par un canal sûr. La personne enrôle sa double authentification à sa
  première connexion.
- **Modifier** le nom, le rôle, activer ou désactiver un compte (un compte désactivé ne peut plus se
  connecter).
- **Réinitialiser la double authentification** (téléphone perdu) ou **le mot de passe** (affiché une
  seule fois, lui aussi).
- Garde-fou : vous ne pouvez ni vous désactiver vous-même ni vous retirer le rôle Administrateur.

### Journal d'audit

Chaque action (création, modification, suppression, connexion, changement de prix, crédit de
pièces…) est tracée avec l'auteur, la date, la cible et les valeurs **avant / après**. Filtrez par
auteur, action, type de cible ou période ; dépliez une ligne pour voir le détail des champs
modifiés. Le journal n'est ni modifiable ni effaçable.

## Erreurs fréquentes

| Message ou symptôme                                                    | Cause probable                                                                  | Que faire                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| « Code invalide » à la connexion                                       | Horloge du téléphone décalée, ou code déjà expiré                               | Attendez le code suivant ; vérifiez l'heure automatique du téléphone                                                       |
| « Trop de tentatives »                                                 | 5 mots de passe erronés en 15 minutes                                           | Patientez 15 minutes ; en cas d'oubli, demandez une réinitialisation à un administrateur                                   |
| Renvoi vers la page de connexion en plein travail                      | Session de 8 heures expirée                                                     | Reconnectez-vous : vous revenez sur la page où vous étiez                                                                  |
| « Droits insuffisants »                                                | Action non ouverte à votre rôle                                                 | Demandez à un éditeur ou un administrateur                                                                                 |
| « Publication refusée : la série doit avoir au moins un épisode prêt » | Aucun épisode transcodé                                                         | Attendez la fin du transcodage ou ajoutez un épisode                                                                       |
| Fichier ignoré au dépôt                                                | Format autre que MP4/MOV, fichier vide ou supérieur à 2 Go                      | Réencodez en MP4 (H.264/AAC) ou découpez le fichier                                                                        |
| Épisode en **Échec**                                                   | Fichier source illisible ou transcodage interrompu                              | « Relancer le transcodage » ; sinon renvoyez le fichier                                                                    |
| Épisode « Prêt » mais absent de l'application                          | Date de publication future, ou série en brouillon / non disponible dans le pays | Vérifiez la colonne Publication, le statut et les territoires de la série                                                  |
| Série publiée mais absente de l'accueil                                | Aucune bannière ni rangée ne la contient, ou filtre pays                        | Ajoutez-la à une rangée manuelle ou vérifiez les pays ; l'aperçu de la Mise en avant vous montre ce que voit l'utilisateur |
| Sous-titre refusé                                                      | Extension autre que .srt/.vtt ou fichier de plus de 2 Mo                        | Exportez en SRT ou VTT ; allégez le fichier                                                                                |
| « Le serveur est injoignable »                                         | Coupure réseau ou API arrêtée                                                   | Vérifiez votre connexion puis « Réessayer » ; si cela persiste, prévenez l'équipe technique                                |
| Bandeau « Mode démonstration »                                         | Le back-office tourne sur des données fictives                                  | Normal en démonstration ; rien n'est enregistré sur le vrai serveur                                                        |

Pour toute situation non couverte, notez l'heure, la page et le message exact (ou une capture
d'écran) et transmettez-les à l'équipe technique : le journal d'audit et les journaux du serveur
permettent de retrouver l'opération.
