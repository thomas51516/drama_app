# Guide du back-office DRAMA (v1)

Ce guide s'adresse à l'équipe éditoriale et aux personnes qui administrent le back-office de
DRAMA, l'application de micro-séries verticales. Il décrit, écran par écran, comment publier une
série de A à Z : connexion, catalogue, épisodes, sous-titres, mise en avant, planification des
sorties, tableau de bord, comptes internes, appareils de confiance, monétisation, récompenses,
utilisateurs, notifications push et centre d'aide. Il est aussi accessible depuis le bouton **Aide** de
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
| Monétisation   | Paramètres de monétisation, packs, formules VIP, récompenses, notifications   |
| Support        | Tout consulter ; utilisateurs (pièces, blocage) et tickets de support         |
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

### Revenus, conversion et rétention

Trois ajouts (sprint 9) viennent compléter les trois sections ci-dessus :

- **Revenus par source** : un tableau (pas un graphique) listant, pour chaque moyen de paiement
  (Google Play, mobile money) et chaque devise, le montant réellement encaissé sur la période et le
  nombre de paiements. Les **codes promo ne sont jamais comptés** : ce ne sont pas des revenus. En
  environnement de test, Google Play peut rester vide : seul l'achat réel (production) renseigne un
  montant.
- **Conversion au paywall** : une tuile indiquant le pourcentage d'utilisateurs ayant vu l'écran de
  paiement puis débloqué un épisode (toute méthode) dans les heures qui suivent, avec le détail
  « X sur Y utilisateurs ». C'est une estimation : le serveur ne peut pas toujours relier
  exactement une vue du paywall au déblocage qui a suivi.
- **Rétention par épisode** : une courbe et un tableau montrant la part des spectateurs de
  l'épisode 1 encore présents à l'épisode 2, 3, etc. Un sélecteur permet de choisir une série ou
  « toute la catalogue ». Utile pour repérer l'épisode où le public décroche.

### Réconciliation des recharges

Sous-entrée **Réconciliation des recharges** du menu Tableaux de bord, réservée aux rôles
Monétisation et Administrateur. Pour un **jour civil** (heure de Lomé, sélecteur avec flèches
précédent/suivant et bouton « Aujourd'hui », jamais de date future) :

- Quatre compteurs : **commandes** créées côté mobile money, **payées** (confirmées par
  l'opérateur), **créditées** (pièces effectivement ajoutées au portefeuille) et **écarts**. Un
  bandeau vert confirme que tout concorde ; un bandeau orange signale des écarts à traiter.
- Le **tableau des écarts** liste, pour chaque commande en cause, l'utilisateur, le pack, le
  montant, le statut côté opérateur, les pièces créditées/attendues et la raison (payée non
  créditée, créditée sans paiement, montant ou pièces différents, crédit en double…). La tâche
  quotidienne du serveur journalise les mêmes écarts.
- **Exporter les écarts (CSV)** télécharge le tableau du jour pour l'envoyer à la comptabilité ou à
  l'agrégateur mobile money.

## Droits et contrats

Menu **Droits et contrats**, ouvert en lecture à tous les rôles ; la création, la modification et
la suppression d'un contrat sont réservées à Monétisation et Administrateur.

- La page liste **toutes les séries** avec leur statut de droits :
  - **Sans contrat** : aucun contrat n'a été enregistré pour cette série.
  - **Actif** : un contrat est enregistré et la date du jour est dans sa fenêtre de licence.
  - **Expiré** : un contrat est enregistré mais hors de sa fenêtre (licence terminée, ou — plus
    rare — pas encore commencée).
- Le filtre **Expire bientôt (30 jours)** ne garde que ce qui demande une action : les séries sans
  contrat, celles dont le contrat est expiré, et celles dont le contrat actif se termine dans les
  30 jours. La liste est triée pour faire remonter ces cas en premier.
- **Important : publier une série sans contrat (ou avec un contrat expiré) n'est jamais bloqué.**
  C'est un choix délibéré pour ne pas casser du contenu déjà en ligne sans contrat enregistré. Un
  bandeau jaune apparaît sur la fiche de la série pour le signaler, et l'action est tracée dans le
  journal d'audit (lisible par les administrateurs) — mais la publication réussit normalement.
- Sur la fiche d'une série (`/series/{id}`), le bloc **Contrat de droits** permet d'enregistrer
  l'ayant droit, les territoires couverts (vide = monde entier, mêmes codes pays que la série
  elle-même), la date de début et de fin de licence (heure de Lomé ; laisser la fin vide pour une
  durée indéterminée) et des notes libres. Une série n'a **qu'un seul contrat courant** : le
  modifier remplace les informations en place, il n'y a pas d'historique des contrats précédents.
  Un bouton **Supprimer le contrat** remet la série à l'état « Sans contrat ».

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

## Appareil de confiance (connexion sans code pendant 30 jours)

Sur l'écran du code à 6 chiffres, la case **« Se souvenir de cet appareil pendant 30 jours »**
(décochée par défaut) évite de ressaisir un code à chaque connexion depuis ce navigateur.

- À ne cocher que sur un **ordinateur personnel** : le serveur mémorise ce navigateur pour votre
  compte uniquement, pendant 30 jours. Le mot de passe reste demandé à chaque connexion.
- **Se déconnecter ne retire pas la confiance** : la prochaine connexion passera directement.
- Pour la retirer : menu utilisateur (en haut à droite) → **Mon compte** → **Appareils de
  confiance**. Vous y voyez chaque navigateur autorisé (date, dernière utilisation, expiration) ;
  **Révoquer** retire un appareil, **Révoquer cet appareil** retire celui que vous utilisez.
- Un administrateur peut révoquer tous les appareils d'un compte (Administration → Comptes,
  icône téléphone) ; réinitialiser la double authentification le fait aussi.
- En cas de doute (ordinateur partagé, perdu), révoquez : un code sera demandé à la connexion suivante.

## Monétisation (paramètres, packs, formules VIP)

Menu **Monétisation**, réservé aux rôles Monétisation et Administrateur. Chaque enregistrement est
tracé dans le journal d'audit (auteur, date, ancienne valeur).

### Paramètres

Valeurs par défaut appliquées à l'application : **épisodes gratuits** par série, **coût par
épisode** (pièces), **remise série complète** (%), **plafond de pubs récompensées par jour**
(0 = désactivé), **déblocage automatique** activé ou non pour les nouveaux comptes, **validité des
pièces bonus** (jours). Une série peut surcharger les deux premiers dans sa fiche. « Enregistrer »
résume les champs modifiés et demande confirmation : la nouvelle valeur s'applique immédiatement.

### Packs de pièces

1. **Nouveau pack** : l'**identifiant produit (SKU)** doit être **exactement celui du produit créé
   dans la Google Play Console** (ex. `coins_300`) ; il ne pourra plus être modifié ensuite (créez un
   autre produit si besoin).
2. Saisissez les **pièces**, les **pièces bonus** (offertes en plus, soumises à la validité des
   bonus), un **badge** facultatif (« Populaire ») et l'état **Actif**.
3. **Prix par devise** : le prix en **F CFA (XOF) est obligatoire** ; NGN, GHS, EUR et USD sont
   facultatifs. « **Compléter depuis le F CFA** » remplit les devises vides avec des taux
   indicatifs que vous pouvez corriger (dépliez « Taux indicatifs ») ; cochez « Écraser » pour
   recalculer des prix déjà saisis. Ce sont les prix **affichés** dans l'application ; le montant
   réellement facturé est celui configuré dans le Play Store pour ce produit.
4. **Glissez les lignes** pour changer l'ordre de la boutique ; l'interrupteur **Actif** retire un
   pack sans le supprimer. La suppression conserve les achats passés dans l'historique.

### Formules VIP

Même principe avec une **période** (hebdomadaire, mensuelle, annuelle) et des **jours d'essai**
(0 = pas d'essai ; l'essai doit aussi exister sur le produit Play Console).

### Simulateur

Choisissez un **pays** et un **pack** : l'onglet montre la **devise** retenue (celle du pays ;
dollar à défaut), le **prix affiché**, les **pièces + bonus** et le prix par pièce, puis la boutique
complète du pays telle que l'application la liste. Un avertissement signale un repli sur le dollar
(pas de prix dans la devise du pays) ou un pack qui ne s'affichera pas (aucun prix).

## Offres et promos

Menu **Offres et promos**, rôles Monétisation et Administrateur. Chaque enregistrement est tracé
dans le journal d'audit.

### Offre de bienvenue

Un seul réglage : bonus en **pourcentage** sur le **premier achat** d'un compte (tous packs ou un
pack précis), pendant un nombre d'**heures après l'inscription** (ex. 48 h). Le serveur applique le
bonus automatiquement au moment du crédit, aussi bien pour un paiement Google Play que pour une
recharge mobile money ; l'aperçu montre l'exemple sur un pack donné.

### Offres limitées

Table des offres en cours : titre, **pack** concerné, **bonus en %**, période de diffusion (saisie
en **heure de Lomé**, vide pour le début = tout de suite) et état (**En cours** / Programmée /
Terminée / Désactivée). « Nouvelle offre » crée une promotion ; l'interrupteur **Actif** la retire
sans la supprimer. Une offre déjà passée reste visible pour l'historique.

### Codes promo

Table des codes : **code**, **pièces offertes**, **limite d'utilisations** (globale et par
utilisateur), période de validité facultative et état. « Nouveau code » propose un **générateur**
(préfixe facultatif + suite de lettres et chiffres sans caractères ambigus comme O/0 ou I/1) ou un
code saisi à la main ; **le code ne peut plus être modifié après création**. Le bouton
**Utilisations** ouvre la liste des comptes qui ont déjà utilisé le code, avec la date. Il n'existe
pas de suppression : désactivez un code pour qu'il ne soit plus accepté.

## Récompenses (check-in et tâches)

Menu **Récompenses**, rôles Monétisation et Administrateur.

### Check-in

Barème des **7 jours consécutifs** : pièces bonus offertes chaque jour, **total sur 7 jours**
affiché en direct, et l'option **« Un jour manqué remet la série à zéro »** (décochée :
l'utilisateur reprend où il s'était arrêté). L'aperçu téléphone montre le rendu dans l'application.

### Tâches

Six tâches à **clés fixes** (regarder 3 épisodes dans la journée, 10 dans la semaine, activer les
notifications, partager une série, compléter son profil, ajouter un favori) : le titre et la
description affichés dans l'application sont gérés par le serveur, vous réglez seulement les
**pièces offertes**, l'**objectif** (nombre à atteindre) et l'état **Actif**. Le bandeau « Potentiel
hebdomadaire » indique ce qu'un utilisateur assidu peut gagner sur 7 jours avec les tâches
actives.

## Utilisateurs (support)

Menu **Utilisateurs**, rôles Support et Administrateur.

1. **Rechercher** par e-mail, téléphone (avec l'indicatif, `+228…`), nom ou identifiant (2
   caractères au moins), puis cliquez sur la ligne.
2. La **fiche** présente le **profil** (type invité / inscrit, moyens de connexion, pays, langue,
   statut, dernière activité), le **portefeuille** (pièces achetées, bonus, total, déblocage
   automatique, bonus qui expirent ; un solde négatif après remboursement bloque tout déblocage),
   l'**abonnement VIP**, et trois onglets : **Déblocages**, **Achats**, **Grand livre** (chaque
   ligne est une variation de pièces ; le solde est leur somme).
3. **Créditer / Débiter des pièces** : choisissez le sens, le nombre de pièces, la catégorie
   (**Bonus** : expirent et sont consommées en premier ; **Achetées** : n'expirent pas), et un
   **motif d'au moins 10 caractères** (visible dans le journal d'audit). Le tableau « Solde après
   l'opération » montre le résultat avant confirmation ; un débit supérieur au solde est refusé.
4. **Bloquer** (motif obligatoire) déconnecte l'utilisateur de tous ses appareils et interdit la
   connexion ; pièces et historique sont conservés. **Débloquer** rétablit l'accès.

> Les montants et statuts affichés viennent du serveur : après une action, la fiche se recharge
> pour montrer la ligne du grand livre réellement enregistrée.

## Notifications push (campagnes)

Menu **Notifications**, réservé aux rôles Monétisation et Administrateur.

1. **Nouvelle campagne** : titre (première ligne vue sur le téléphone), message (**178 caractères
   au plus**, compteur sous le champ), lien d'ouverture facultatif (`drama://series/{id}` ; le
   sélecteur « Utiliser cette série » le remplit pour vous ; vide = accueil de l'application).
2. **Cible** : tous les utilisateurs, par pays (codes à deux lettres), abonnés d'une série (série à
   choisir) ou inactifs depuis X jours (1 à 365).
3. **Programmer l'envoi** (facultatif, heure de Lomé) : vide = envoi immédiat au moment d'« Envoyer ».
4. **Estimer l'audience** à tout moment (icône calculatrice). **Envoyer** recalcule l'estimation et
   demande confirmation avec le nombre d'utilisateurs visés ; avec une date future la campagne passe
   en **Programmée** et reste **annulable** jusqu'à cette date. Une fois l'envoi démarré, il ne peut
   plus être arrêté ; les compteurs « Envoyés » se mettent à jour automatiquement.
5. Les étiquettes du haut comptent les campagnes par statut (Brouillon, Programmée, Envoi en cours,
   Envoyée, Annulée) et filtrent la liste ; le détail (icône i ou clic sur le titre) montre le
   message tel que vu sur le téléphone, la cible, l'audience, le nombre envoyé et la chronologie.

> Le serveur applique les préférences de chaque utilisateur (« offres » désactivées) et le plafond de
> deux notifications par jour : le nombre envoyé est donc souvent inférieur à l'audience estimée.

## Centre d'aide (FAQ et support)

Menu **Centre d'aide** : onglet **FAQ** pour les rôles Éditeur, Support et Administrateur ; onglet
**Support** pour Support et Administrateur. Le badge sur l'entrée du menu compte les tickets ouverts.

### FAQ

- Les questions sont regroupées par **catégorie** (compte, pièces, VIP, lecture, paiement, contenu,
  autre). Dans une catégorie, **glissez les lignes** pour changer l'ordre affiché dans l'application.
- **Nouvelle question** : catégorie, puis question et réponse en **français (obligatoire)** et, via
  les boutons FR / EN / ES / PT, dans les autres langues. Une langue vide reprend le français dans
  l'application ; une traduction doit comporter la question **et** la réponse.
- L'interrupteur **Publiée** rend la question visible dans l'application ; une question non publiée
  reste un brouillon.
- L'**aperçu** à droite montre exactement ce que reçoit l'application pour la langue choisie
  (étiquette « Repli sur le français » quand la traduction manque).

### Support

- La **boîte de réception** liste les tickets envoyés depuis l'application (filtre par statut :
  Ouvert, Répondu, Fermé ; les ouverts par défaut). Cliquez un ticket pour lire la conversation.
- **Envoyer la réponse** : l'utilisateur la reçoit en notification et dans son historique ; le
  ticket passe en **Répondu** (il repasse en Ouvert si l'utilisateur répond).
- **Fermer le ticket** quand le sujet est réglé : plus aucune réponse n'est possible.

## Erreurs fréquentes

| Message ou symptôme                                                    | Cause probable                                                                  | Que faire                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| « Code incorrect ou expiré » à la connexion                            | Horloge du téléphone décalée, ou code déjà expiré                               | Attendez le code suivant ; vérifiez l'heure automatique du téléphone                                                       |
| « Saisissez les 6 chiffres du code »                                   | Code incomplet (le bouton Vérifier reste gris tant qu'il manque un chiffre)     | Complétez les 6 cases                                                                                                      |
| « Solde insuffisant : le serveur a refusé le débit »                   | Débit de pièces supérieur au solde de la catégorie choisie                      | Réduisez le montant ou changez de catégorie (achetées / bonus)                                                             |
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
