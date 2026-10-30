# Cahier de recette — lot « regarder » et compte (S05-QA-01)

Version 1.0 — 30 octobre 2026 — QA DRAMA. Couvre les fonctions **P1** livrées aux sprints 1 à 4 (plus les tickets
du sprint 5 déjà livrés) : application Android (M-01, M-02, M-03, M-10 à M-16, M-50 à M-52), back-office
(B-01, B-02, B-03, B-05, B-13 ; B-04 et B-11 v0 en information), API et règles métier du §8.4 observables.
Référence : `docs/Cahier des charges — Application de micro-séries verticales (Android).md` (§4, §5, §7, §8.4, §15.3).

Les fonctions P1 non encore livrées (paywall M-20 à M-22, boutique M-30 à M-33, check-in M-40, aide M-53, push
M-54, B-06, B-08, B-09, B-11 complet) ne figurent pas dans ce cahier ; elles seront ajoutées aux sprints 7 à 10.

## 1. Conventions

| Élément | Règle |
| --- | --- |
| Identifiant | `RC-0xx` Android, `RC-1xx` API et règles métier, `RC-2xx` back-office |
| Priorité | **P1** : bloque la recette du jalon ; **P2** : à corriger avant mise en ligne ; **P3** : confort |
| Résultat | **OK** conforme · **KO** non conforme (défaut `DEF-xxx` ouvert) · **NT** non testable / non testé (motif noté) · **—** sans objet sur cet appareil |
| Preuve | capture `docs/recette/evidence/<appareil>-<n°>-<nom>.png`, ligne Logcat (tags `PlayerSpike`, `Player`, `Analytics`, `Http`, `Session`, `AppStartup`) ou réponse HTTP |
| Données de test | préfixe `QA-` pour tout ce qui est créé pendant une campagne ; supprimé ou archivé en fin de campagne ; ne jamais toucher `admin@drama.local` |

Colonnes d'exécution : **CM6** = TECNO CM6 (Android 16, 1080×2436, 8 Go), **E36** = émulateur
`Medium_Phone_API_36.1` (Android 16, 1080×2400, 2 Go), **E29** = émulateur `QA_LowEnd_API29` (Android 10,
720×1600, 320 dpi, 2 Go, 2 cœurs), **A4–A8** = appareils 4 à 8 de la matrice (à acquérir, voir §2). Les colonnes
sont renseignées dans le rapport de campagne, pas dans ce cahier.

## 2. Matrice d'appareils cible (§15.3 : au moins 8 appareils dont 3 d'entrée de gamme)

| N° | Appareil | Android | RAM | Catégorie | Disponibilité |
| --- | --- | --- | --- | --- | --- |
| 1 | TECNO CM6 (téléphone du client) | 16 (API 36) | 8 Go | milieu de gamme | disponible |
| 2 | Émulateur `Medium_Phone_API_36.1` | 16 (API 36) | 2 Go | référence API cible | disponible |
| 3 | Émulateur `QA_LowEnd_API29` (720×1600, 2 cœurs) | 10 (API 29) | 2 Go | **entrée de gamme** | disponible (créé le 30/10) |
| 4 | Téléphone Android 8.0/8.1 (API 26/27), 2 Go (ex. TECNO Spark 2, Itel A56) | 8.x | 2 Go | **entrée de gamme** | à acquérir |
| 5 | Téléphone Android 11/12 Go edition, 2 à 3 Go (ex. Samsung A03 Core, Infinix Smart 6) | 11-12 | 2-3 Go | **entrée de gamme** | à acquérir |
| 6 | Téléphone Android 13, 4 Go (ex. Infinix Hot 30, Redmi 12C) | 13 | 4 Go | milieu de gamme | à acquérir |
| 7 | Téléphone Android 14, 6 Go, écran 120 Hz (ex. Samsung A25, Pixel 7a) | 14 | 6-8 Go | haut de gamme | à acquérir |
| 8 | Tablette ou pliable Android 14+ (écran large, ratio non 20:9) | 14+ | 4 Go+ | atypique | à acquérir |

Réseaux à couvrir : Wi-Fi, 4G réelle (critère M-12), 3G simulée (émulateur `-netspeed edge/3g`), coupure réseau.

## 3. Prérequis communs

| Réf. | Prérequis |
| --- | --- |
| PR-1 | Services de dev démarrés : `docker compose -f infra/docker-compose.dev.yml up -d` (PostgreSQL, Redis, MinIO) |
| PR-2 | Backend `npm run dev` sur `:3000` (Swagger `/docs`), base seedée (`npm run db:seed`) : série publiée « Le Secret du Lagon » (3 épisodes, 2 gratuits, 10 pièces), brouillon « Ombres sur Abidjan », 1 bannière, rangées Tendances / Nouveautés / genres |
| PR-3 | Back-office `npm run dev:admin` sur `:3100` en mode réel (`NUXT_PUBLIC_API_MOCK=false`) ; compte `editor@drama.local` enrôlé en TOTP ; code via `node backend/scripts/totp-code.mjs <secret>` |
| PR-4 | APK de debug construit depuis le commit testé (`JAVA_HOME=$HOME/.jdks/jdk17 ./gradlew :app:assembleDebug`), hash SHA-256 et taille notés dans le rapport |
| PR-5 | Émulateur : API joignable sur `10.0.2.2:3000`, médias sur `192.168.1.145:9000` (`CDN_BASE_URL`) ; téléphone : même Wi-Fi, APK construit avec `-PdramaApiBaseUrl`/`-PdramaMediaBaseUrl` |
| PR-6 | Logcat vidé avant chaque cas (`adb logcat -c`, `adb logcat -b crash -c`) |

## 4. Application Android

### 4.1 M-50 — Compte invité automatique

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-001 | Création de l'invité au premier lancement | App fraîchement installée (`pm clear`) | 1. Lancer l'app. 2. `adb logcat -s AppStartup Session Http` | `POST /auth/guest` → 201, `Session: guest session created user=<uuid>`, l'accueil s'affiche sans écran de connexion | P1 |
| RC-002 | Persistance de la session | RC-001 fait | 1. Fermer l'app (`am force-stop`). 2. Relancer | Aucun nouvel appel `/auth/guest` ; même `userId` dans `AppStartup: guest session ready` | P1 |
| RC-003 | Rafraîchissement du jeton | Session de plus de 15 min | 1. Attendre l'expiration du JWT. 2. Ouvrir une fiche série | `POST /auth/refresh` → 200 une seule fois, requête rejouée ; identifiant invité inchangé | P1 |
| RC-004 | Refresh rejeté | Jetons invalidés côté serveur (base réinitialisée) | 1. Ouvrir le lecteur | L'app recrée un invité sans plantage ; l'utilisateur en est informé (comportement à qualifier, voir DEF) | P2 |
| RC-005 | Identifiant invité visible | — | Onglet Profil | « Identifiant invité : <8 premiers caractères>… » affiché ; les trois options de connexion proposées | P2 |

### 4.2 M-01 — Accueil

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-010 | Chargement de l'accueil | PR-2 | 1. Lancer l'app. 2. Observer `Http` | `GET /home` → 200 ; bannière(s) puis rangées dans l'ordre configuré en B-05 ; rangées vides masquées | P1 |
| RC-011 | Bannière | Bannière active en B-05 | 1. Appuyer sur la bannière | Fiche série correspondante ; carrousel automatique toutes les 5 s si plusieurs bannières | P1 |
| RC-012 | Rangées typées | Rangées TRENDING, NEW, GENRE, MANUAL actives | 1. Faire défiler l'accueil | Titres dans la langue de l'appareil (`Accept-Language`), 12 séries max par rangée, cartes 2:3 avec affiche | P1 |
| RC-013 | Continuer à regarder | Un épisode commencé non terminé | 1. Revenir à l'accueil | Rangée « Continuer à regarder » avec badge « Ép. N » et barre de progression ; appui → lecteur à la position de reprise | P1 |
| RC-014 | Filtrage par pays | Rangée ou bannière limitée à un pays (`countries`) | 1. Appareil avec SIM / locale d'un autre pays | Élément absent de l'accueil ; présent pour le pays ciblé (`X-Country`) | P1 |
| RC-015 | Pull-to-refresh | — | 1. Tirer vers le bas | Nouveau `GET /home`, indicateur de rafraîchissement, pas de saut d'écran | P2 |
| RC-016 | Hors-ligne avec cache | Accueil déjà chargé, puis mode avion | 1. Relancer l'app | Accueil servi depuis Room, bandeau « Hors ligne : contenu en cache », pas de plantage | P1 |
| RC-017 | Squelette au premier chargement | App fraîche, réseau lent (`-netspeed edge`) | 1. Lancer | Squelette animé puis contenu ; aucun écran blanc | P2 |

### 4.3 M-02 — Flux « Pour vous »

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-020 | Lecture automatique des extraits | Au moins une série publiée avec `previewKey` | 1. Onglet « Pour vous » | `GET /feed?limit=10` → 200 ; l'extrait démarre seul, muet, mention « Appuyez pour activer le son » ; `PlayerSpike: first_frame` | P1 |
| RC-021 | Son à l'appui | RC-020 | 1. Appuyer sur la vidéo | Son activé pour la session ; mention masquée | P2 |
| RC-022 | Balayage vertical | Au moins 2 éléments dans le flux | 1. Balayer vers le haut puis vers le bas | Page suivante / précédente, extrait voisin préchargé (`preloaded=true`), `series_view{source=feed}` à chaque page stabilisée | P1 |
| RC-023 | Actions du flux | RC-020 | 1. Cœur. 2. « Regarder la série » | `PUT /me/favorites/{id}` → 204 et icône « Retirer de Ma liste » ; ouverture de la fiche série | P1 |
| RC-024 | Pagination par curseur | Plus de 10 séries publiées | 1. Balayer jusqu'au 9e élément | `GET /feed?cursor=…` appelé avant la fin ; pas de rupture | P1 |
| RC-025 | Arrêt en arrière-plan | RC-020 | 1. Mettre l'app en arrière-plan | Lecture arrêtée (pas de son) ; reprise au retour | P1 |
| RC-026 | Flux vide | Aucun extrait disponible | 1. Onglet « Pour vous » | État vide explicite, pas d'écran noir | P2 |

### 4.4 M-03 — Recherche

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-030 | Suggestions | PR-2 | 1. Loupe de l'accueil. 2. Saisir « lag » | Après ~300 ms, `GET /search/suggest?q=lag` ; suggestion « Le Secret du Lagon » | P1 |
| RC-031 | Résultats par titre | — | 1. Valider la recherche | `GET /search?q=lag&page=1&pageSize=20` ; compteur « 1 résultat », carte de la série ; `Analytics: search{query, result_count}` | P1 |
| RC-032 | Recherche par genre | — | 1. Appuyer sur la puce « Romance » | Résultats des séries du genre (`genre=romance`) sans texte obligatoire | P1 |
| RC-033 | Recherche par mot-clé et accents | Série taguée « héritage » | 1. Saisir « heritage » (sans accent) puis « SECRÉT » | Résultat trouvé dans les deux cas (unaccent, insensible à la casse) | P1 |
| RC-034 | Aucun résultat | — | 1. Saisir « zzzzqqq » | Message « Aucune série pour « zzzzqqq ». » ; aucune erreur | P1 |
| RC-035 | Historique de recherche | 2 recherches validées | 1. Revenir à l'écran de recherche vide | Recherches récentes listées (10 max), effaçables une à une et toutes | P1 |
| RC-036 | Brouillons et séries non autorisées exclus | Série DRAFT « Ombres sur Abidjan » | 1. Rechercher « Abidjan » | Aucun résultat | P1 |

### 4.5 M-10 — Fiche série

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-040 | Contenu de la fiche | — | 1. Ouvrir « Le Secret du Lagon » | Affiche, titre, « 12+ », « 3 épisodes », « 2 gratuits », genres, synopsis dépliable (« Lire la suite »), `GET /series/{id}` + `/episodes` → 200, `Analytics: series_view{source=home}` | P1 |
| RC-041 | Grille des épisodes et statuts | Invité sans déblocage | 1. Faire défiler jusqu'à la grille | Ép. 1 et 2 « Gratuit », ép. 3 cadenas + « 10 » (coût) ; 5 colonnes | P1 |
| RC-042 | Bouton de lecture contextuel | Aucune lecture, puis ép. 2 commencé | 1. Observer le bouton principal | « Regarder » au premier passage ; « Reprendre l'épisode 2 » après une lecture non terminée | P1 |
| RC-043 | Épisode verrouillé | — | 1. Appuyer sur l'épisode 3 | Page lecteur « Épisode verrouillé — paywall au sprint 7 », « Épisode 3 · 10 pièces », aucune lecture, `POST /play` → 403 `EPISODE_LOCKED`, `Analytics: paywall_view` | P1 |
| RC-044 | Lien profond | — | `adb shell am start -a android.intent.action.VIEW -d "drama://series/<id>" com.drama.app.debug` | Fiche série ouverte, `series_view{source=deeplink}` | P1 |
| RC-045 | Lien HTTPS (App Links) | Hôte `links.drama.example` (assetlinks non publié) | `am start -a VIEW -d "https://links.drama.example/s/<id>"` | Sélecteur d'application ou ouverture directe une fois `assetlinks.json` publié (NT tant que le domaine n'existe pas) | P2 |
| RC-046 | Fiche hors-ligne | Fiche déjà visitée, mode avion | 1. Rouvrir la fiche | Contenu depuis le cache (stale-while-revalidate), pas d'erreur bloquante | P1 |

### 4.6 M-11 / M-12 — Lecteur vertical et préchargement

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-050 | Lecture plein écran portrait | — | 1. « Regarder » | Vidéo entière (Fit, sans rognage), bandes noires fines, barre d'état visible, écran maintenu allumé, `PlayerSpike: first_frame index=0` | P1 |
| RC-051 | Démarrage < 1,5 s (cache vide) | Cache vidé (`pm clear`) | 1. Lancer l'épisode 1. 2. Lire `startup_ms` | `startup_ms` < 1 500 ms en 4G réelle (téléphone) ; valeur relevée sur émulateur à titre indicatif | P1 |
| RC-052 | Balayage = épisode suivant / précédent | — | 1. Balayer vers le haut, puis vers le bas | `Player: page settled index=1 (was 0)`, lecture de l'épisode suivant ; retour à l'épisode précédent à la position quittée | P1 |
| RC-053 | Préchargement du suivant | — | 1. Lire l'épisode 1 quelques secondes. 2. Balayer | `PlayerSpike: preload completed index=1` avant le balayage, puis `first_frame index=1 … preloaded=true` avec `startup_ms` < 500 ms | P1 |
| RC-054 | Enchaînement automatique | — | 1. Laisser l'épisode 1 se terminer | `Analytics: episode_complete`, overlay « Épisode suivant ▶ » 3 s puis `Player: next episode index=1` ; sur le dernier épisode : « Revoir » | P1 |
| RC-055 | Enchaînement vers un épisode verrouillé | — | 1. Laisser l'épisode 2 se terminer | Page « verrouillé » de l'épisode 3, pas de plantage ni de lecture | P1 |
| RC-056 | Retour et libération | — | 1. Bouton Retour | `PlayerSpike: engine released`, progression envoyée (`Player: progress sent`) | P1 |
| RC-057 | Coupure réseau pendant la lecture | — | 1. Mode avion 10 s en cours de lecture. 2. Rétablir | Lecture continue sur le tampon, `Player: progress not sent …Network`, reprise automatique sans intervention | P1 |
| RC-058 | API indisponible | Arrêter le backend | 1. Lire un épisode déjà résolu | Lecture et enchaînement continuent ; erreurs journalisées sans plantage ; progression rattrapée au retour | P1 |
| RC-059 | URL signée : renouvellement avant expiration | `PLAYBACK_URL_TTL_SECONDS=300` | 1. Mettre en pause 5 min | `Player: signed URL about to expire index=N: re-requesting /play` ~30 s avant `expiresAt`, lecture reprend à la même position | P1 |
| RC-060 | URL signée : 403 du CDN | Signataire `hmac` sur une instance dédiée | 1. Forcer une URL expirée | Un seul `POST /play` de réessai puis reprise ; second 403 → erreur affichée | P1 |
| RC-061 | Mémoire pendant la lecture | — | `adb shell dumpsys meminfo com.drama.app.debug` après 3 épisodes | PSS stable (< 200 Mo en debug sur 2 Go), pas de croissance continue, au plus deux `ExoPlayer` vivants | P1 |
| RC-062 | Rotation / multi-fenêtre | — | 1. Tourner l'appareil | Portrait forcé, pas de recréation du lecteur | P2 |

### 4.7 M-13 — Contrôles

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-070 | Pause / reprise | Lecture en cours | 1. Appui simple. 2. Appui simple | Position figée (« 0:07 » stable 3 s), puis reprise | P1 |
| RC-071 | Avance / retour 10 s | — | 1. Double appui à droite. 2. Double appui à gauche | +10 s (0:07 → 0:17) puis −10 s (→ 0:07) | P1 |
| RC-072 | Barre de progression | — | 1. Glisser le curseur | Libellé `m:ss / m:ss`, recherche à la position relâchée | P1 |
| RC-073 | Vitesse | — | 1. Puce « 1x » ou ⚙ → Vitesse | Choix 0,75× / 1× / 1,25× / 1,5× / 2× ; `PlayerSpike: settings applied speed=…` ; persistée après redémarrage | P1 |
| RC-074 | Qualité | Manifeste 360p-1080p | 1. Puce qualité | Choix Auto / 1080p / 720p / 540p / 360p selon le manifeste ; `selected video format … cap_short_side=360` ; affichage « Auto · 540p » en mode auto ; persistée | P1 |
| RC-075 | Son / Muet | — | 1. Bouton « Son » | Bascule muet, libellé mis à jour | P2 |
| RC-076 | Menu Paramètres | — | 1. ⚙ | Feuille « Paramètres de lecture » : Sous-titres, Vitesse, Qualité avec valeurs courantes ; fermeture par Retour | P1 |

### 4.8 M-14 — Sous-titres

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-080 | Sélection automatique | Appareil en français, piste `fr` | 1. Lire | `tracks … text=[fr] selected_text=fr`, puce « CC FR », cues affichées en bas de l'image | P1 |
| RC-081 | Appareil dans une langue sans piste | Appareil `en-US`, piste `fr` seule | 1. Lire | Mode Auto → sous-titres désactivés (« CC Off »), piste proposée dans le menu | P1 |
| RC-082 | Choix manuel et désactivation | — | 1. Puce CC → « Français (FR) ». 2. « Désactivés » | Activation immédiate ; désactivation ; préférence conservée sur l'épisode suivant et après redémarrage | P1 |
| RC-083 | Plusieurs langues | Épisode avec `fr` et `en` | 1. Menu CC | Les deux langues listées avec libellé natif (« Français », « English ») | P1 |
| RC-084 | Lisibilité | — | Observation | Blanc gras sur fond translucide, au-dessus de la barre de progression, non coupé par les bandes | P2 |

### 4.9 M-15 — Reprise

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-090 | Envoi périodique | — | 1. Lire 12 s | `PUT /progress` toutes les 5 s, à la pause et à la sortie (`Player: progress sent … position_ms`) | P1 |
| RC-091 | Reprise locale après fermeture forcée | 12 s lues | 1. `am force-stop`. 2. Rouvrir, « Reprendre l'épisode N » | `PlayerSpike: start … start_ms≈12000`, `Analytics: episode_start{resumed=true}` | P1 |
| RC-092 | Reprise cross-device | Compte rattaché, progression sur l'appareil A | 1. Se connecter sur l'appareil B | Fiche série « Reprendre l'épisode N », position serveur (`resumePositionSeconds`) appliquée à la seconde près | P1 |
| RC-093 | Épisode terminé | Épisode lu jusqu'au bout | 1. Rouvrir la fiche | Épisode terminé exclu de « Continuer à regarder », bouton vers l'épisode suivant | P1 |

### 4.10 M-16 — Favoris, J'aime, partage

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-100 | Ajouter à Ma liste | — | 1. Cœur de la fiche série | `PUT /me/favorites/{id}` → 204, icône « Retirer de Ma liste », `Analytics: favorite{added=true}` ; optimiste (immédiat) | P1 |
| RC-101 | Onglet Ma liste | RC-100 | 1. Onglet « Ma liste » | `GET /me/favorites` ; carte de la série, « 3 ép. », retrait par le cœur, pull-to-refresh | P1 |
| RC-102 | Retrait et retour arrière | Réseau coupé | 1. Retirer de Ma liste hors-ligne | Retour arrière visuel à l'échec, message d'erreur | P2 |
| RC-103 | J'aime | — | 1. Appuyer sur « J'aime » deux fois | `POST /series/{id}/like` → `{likes, liked:true}`, compteur +1 ; second appui → `DELETE`, compteur −1 | P1 |
| RC-104 | Partage | — | 1. Bouton Partager (fiche ou lecteur) | Feuille de partage système avec `https://links.drama.example/s/<id>`, `Analytics: share{source}` | P1 |
| RC-105 | Favoris conservés au rattachement | Invité avec 1 favori | 1. Créer un compte e-mail | Ma liste inchangée après `linked=true` | P1 |

### 4.11 M-51 — Connexion Google, téléphone + OTP, e-mail

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-110 | Écran Profil invité | — | Onglet Profil | Trois options : Google, téléphone (« Code à 6 chiffres par SMS »), e-mail (« Inscription ou connexion par mot de passe ») | P1 |
| RC-111 | Inscription e-mail | Adresse `qa-<appareil>@qa.drama.local` | 1. E-mail → « Créer un compte ». 2. Saisir, valider | `POST /auth/email/register` → 201 `linked=true`, message « Compte rattaché, votre historique est conservé », carte de profil | P1 |
| RC-112 | Connexion e-mail existante | Compte créé sur un autre appareil | 1. « J'ai déjà un compte » | `POST /auth/email/login` → 200 ; fusion de l'invité (`linked=true`) ; favoris et progression de l'autre appareil visibles | P1 |
| RC-113 | Erreurs e-mail | — | 1. Mauvais mot de passe. 2. Mot de passe < 8. 3. E-mail déjà pris à l'inscription | Messages distincts : identifiants invalides / mot de passe trop court / adresse déjà utilisée ; pas de session | P1 |
| RC-114 | OTP : demande et saisie | `SMS_PROVIDER=console` | 1. Téléphone → indicatif +228, numéro. 2. Code lu dans Redis `otp:<requestId>` | `POST /auth/otp/request` → 200 ; saisie auto-validée à 6 chiffres ; « Renvoyer le code » après 60 s ; session ouverte | P1 |
| RC-115 | OTP : mauvais code | — | 1. Saisir 000000 | « Code incorrect » avec essais restants ; 5 erreurs → demande d'un nouveau code | P1 |
| RC-116 | Google | `GOOGLE_WEB_CLIENT_ID` configuré, compte Google sur l'appareil | 1. « Continuer avec Google » | Boîte Credential Manager, `POST /auth/google` → 200 `linked=true` | P1 |
| RC-117 | Google non configuré | Sans identifiant client | Profil | Bouton désactivé « non configuré » | P2 |
| RC-118 | Déconnexion | Compte connecté | 1. « Se déconnecter » | `POST /auth/logout` → 204 puis nouvel invité ; historique local effacé | P1 |

### 4.12 M-52 — Profil, langue, suppression

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-120 | Carte de profil | Compte connecté | Onglet Profil | Nom, e-mail ou téléphone, fournisseurs, langue | P1 |
| RC-121 | Modifier le nom | — | 1. Modifier, enregistrer | `PATCH /me {displayName}` → 200 ; nom mis à jour partout | P1 |
| RC-122 | Modifier la langue | — | 1. Choisir EN | `PATCH /me {language:"en"}` ; interface et rangées de l'accueil en anglais (S05-A1-03 / S05-A2-03 en cours) | P1 |
| RC-123 | Suppression du compte | — | 1. « Supprimer mon compte », confirmer | `DELETE /me` → 202 `scheduledFor` +30 j ; retour en invité ; message de délai | P1 |
| RC-124 | Préférences de notification | — | Profil | Trois interrupteurs (nouveaux épisodes, offres, rappel) → `PATCH /me {notificationPreferences}` (livraison S05-A1-03) | P1 |

### 4.13 Exigences non fonctionnelles (§7)

| ID | Cas | Prérequis | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- | --- |
| RC-130 | Démarrage à froid | App tuée | `adb shell am start -W -S com.drama.app.debug/com.drama.app.MainActivity` ×3 | `TotalTime` médian < 2 500 ms sur appareil 2 Go | P1 |
| RC-131 | Taille du livrable | Build | `ls -l app-debug.apk` ; AAB release | APK/AAB téléchargé < 30 Mo (debug non représentatif, à mesurer sur l'AAB release) | P1 |
| RC-132 | Plantages | Toute la campagne | `adb logcat -b crash -d` en fin de session | 0 `FATAL EXCEPTION` | P1 |
| RC-133 | Fluidité | Accueil et flux | `adb shell dumpsys gfxinfo com.drama.app.debug` après défilement | Janky frames < 10 % | P2 |
| RC-134 | Compatibilité minimale | Appareil API 26 | Parcours RC-001, 010, 040, 050 | Identique aux autres appareils | P1 |
| RC-135 | Langue de l'appareil | Appareil en EN, ES, PT | Lancer | Interface traduite (S05-A2-03 en cours : NT jusqu'à livraison) | P1 |
| RC-136 | Accessibilité | TalkBack | Parcourir accueil et lecteur | Chaque bouton a un libellé (`content-desc` : Rechercher, Retour, Partager, Ajouter à Ma liste…), tailles de texte dynamiques respectées | P2 |

## 5. API et règles métier (§8.2, §8.4, §12 sécurité)

Exécution par `curl` contre `http://localhost:3000` ; l'utilisateur de test est un invité créé par `POST /auth/guest`.

### 5.1 Authentification et sessions

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-150 | Invité : validation | `POST /auth/guest` corps `{}` puis `{"deviceId":123,"extra":"x"}` | 400 `VALIDATION_ERROR` avec `details.errors` (longueur 8-128, propriété inconnue refusée) | P1 |
| RC-151 | Routes protégées sans jeton | `GET /me`, `POST /episodes/{id}/play`, `PUT /me/favorites/{id}` | 401 `UNAUTHENTICATED` | P1 |
| RC-152 | Jeton altéré, `alg:none`, signature tronquée | `GET /me` | 401 `INVALID_TOKEN` | P1 |
| RC-153 | Séparation des audiences | Jeton utilisateur sur `/admin/series` ; jeton admin sur `/me` | 401 `INVALID_ADMIN_TOKEN` / 401 `INVALID_TOKEN` | P1 |
| RC-154 | Rotation du refresh | `POST /auth/refresh` deux fois avec le même jeton | 1er : nouvelle paire ; 2e : 401 `REFRESH_TOKEN_REUSED` et la nouvelle paire révoquée aussi | P1 |
| RC-155 | Limitation de débit `/auth/guest` | > 30 appels en 15 min depuis une même IP (**utiliser `[::1]`**, jamais l'IP LAN) | 429 `RATE_LIMITED` au 31e, `Retry-After`, `details.limit=30` ; `127.0.0.1` et les autres routes non affectés | P1 |
| RC-156 | E-mail : inscription rattachant l'invité | `POST /auth/email/register` avec le porteur invité | 201, `linked=true`, même `user.id`, `type=REGISTERED`, `providers=["email"]` | P1 |
| RC-157 | E-mail : erreurs | doublon, mot de passe court, mauvais mot de passe | 409 `EMAIL_TAKEN`, 400 `VALIDATION_ERROR`, 401 `INVALID_CREDENTIALS` | P1 |
| RC-158 | E-mail : second appareil | `login` sans porteur invité | 200 `linked=false`, même `user.id`, profil (nom, langue) retrouvé | P1 |
| RC-159 | OTP : cycle complet | request → resend immédiat → mauvais code → bon code (Redis) → réutilisation | 200 `{requestId, expiresIn:300, resendAfter:60}` ; 429 `OTP_RESEND_TOO_SOON` ; 401 `OTP_INVALID_CODE` `attemptsLeft` ; 200 session `providers=["phone"]` ; 404 `OTP_REQUEST_NOT_FOUND` | P1 |
| RC-160 | OTP : numéro invalide | `{"phone":"0612"}` | 400 « phone must be E.164 » | P1 |
| RC-161 | Google : erreurs | sans `idToken` ; `idToken` forgé | 400 ; 401 `GOOGLE_TOKEN_INVALID` (503 `GOOGLE_AUTH_DISABLED` si non configuré) | P1 |
| RC-162 | Déconnexion | `POST /auth/logout {refreshToken}` puis refresh | 204 puis 401 ; `{}` → 400 | P1 |
| RC-163 | Suppression différée | `DELETE /me` puis `GET /me`, refresh | 202 `{scheduledFor}` (+30 j) ; statut `DELETION_PENDING` ; refresh 401 | P1 |

### 5.2 Catalogue, lecture, progression

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-170 | Accueil par pays et langue | `GET /home` avec `X-Country`/`Accept-Language` (fr, en, pt) | Titres traduits ; rangées limitées à un pays absentes ailleurs ; avec jeton, rangée `continue_watching` ajoutée après cache | P1 |
| RC-171 | Fiche et grille | `GET /series/{id}`, `/episodes` | `access` `free`/`locked`, `coinCost`, `subtitles[{language,label,url}]` ; 404 `SERIES_NOT_FOUND` pour un brouillon ou un id inconnu | P1 |
| RC-172 | Pagination bornée | `GET /series?page=0&pageSize=1000` | 400 (page ≥ 1, pageSize ≤ 50) | P2 |
| RC-173 | Recherche | `q` vide / > 100 caractères / injection `'; DROP TABLE` / genre seul | 400 / 400 / 200 vide / voir DEF (genre seul) | P1 |
| RC-174 | Lecture d'un épisode gratuit | `POST /episodes/{id}/play` | 200 `manifestUrl`, `expiresAt` = +`PLAYBACK_URL_TTL_SECONDS`, `drm.type`, `subtitles`, `resumePositionSeconds`, `nextEpisodeId` ; manifeste HLS multi-débits joignable | P1 |
| RC-175 | Lecture d'un épisode verrouillé | ép. 3 | 403 `EPISODE_LOCKED` `{coinCost, freeEpisodeCount}` | P1 |
| RC-176 | Épisode inconnu ou non visible | id aléatoire ; épisode READY sans `publishedAt` | 404 `EPISODE_NOT_FOUND` | P1 |
| RC-177 | Progression : validation | `episodeId` non UUID, `positionSeconds` < 0, > 86400, décimal | 400 avec messages explicites | P1 |
| RC-178 | Progression : enregistrement et reprise | `PUT /progress {positionSeconds:12}` puis `/play` | `resumePositionSeconds=12` | P1 |
| RC-179 | Progression sur épisode verrouillé | `PUT /progress` sur l'ép. 3 | Refus attendu (serveur fait foi) — voir DEF | P2 |
| RC-180 | Expiration des URLs signées | `MEDIA_SIGNER=hmac` sur une instance dédiée ; URL après `expires` | CDN/MinIO → 403 ; en `plain` (dev) : aucun contrôle, NT | P1 |
| RC-181 | Flux | `GET /feed`, `cursor=garbage` | Éléments `{series, episode, previewUrl, previewExpiresAt, isFavorite}` ; curseur invalide → 400 attendu (voir DEF) | P2 |
| RC-182 | Territoires | Série limitée à `AQ` : `GET /series/{id}`, `/search`, `/play` avec `X-Country: TG` | 404 / 0 résultat / 404 ou 403 (voir DEF) | P2 |

### 5.3 Favoris, J'aime (idempotence §8.4)

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-190 | `PUT /me/favorites/{id}` idempotent | 2 appels puis `GET /me/favorites` | 204, 204 ; `total=1` ; `isFavorite=true` sur la fiche | P1 |
| RC-191 | `DELETE /me/favorites/{id}` idempotent | 2 appels puis `GET` | 204, 204 ; `total=0` | P1 |
| RC-192 | Favori : erreurs | série inconnue ; id non UUID ; sans jeton | 404 `SERIES_NOT_FOUND` ; 400 ; 401 | P1 |
| RC-193 | J'aime idempotent | `POST /series/{id}/like` ×2, `DELETE` ×2 | `{likes:n+1, liked:true}` ×2 ; `{likes:n, liked:false}` ×2 | P1 |

### 5.4 Robustesse et sécurité transverses

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-200 | Format d'erreur | toute erreur | `ApiErrorDto {statusCode, code, message, details?, path, timestamp, requestId}` + en-tête `x-request-id` | P1 |
| RC-201 | Corps surdimensionné | 2 Mo sur `/auth/guest` | 413 | P2 |
| RC-202 | Route inconnue / méthode | `GET /nope`, `DELETE /home` | 404 JSON `NOT_FOUND` | P2 |
| RC-203 | CORS | `OPTIONS /home` depuis `http://evil.example` puis `http://localhost:3100` | Pas d'`Access-Control-Allow-Origin` ; `…: http://localhost:3100` | P1 |
| RC-204 | En-têtes de sécurité | `GET /home` | HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options` | P2 |
| RC-205 | Webhook transcodage | `POST /webhooks/transcode/local` non signé | 401 `INVALID_WEBHOOK_SIGNATURE` (400 si corps invalide) | P1 |
| RC-206 | Santé et documentation | `GET /health`, `/health/live`, `/docs-json`, `/metrics` | 200 ; `database` et `redis` `up` ; version OpenAPI cohérente avec `docs/api/openapi.v1.json` | P2 |

## 6. Back-office web

Navigateur Chrome (puppeteer-core, 1366×900) sur `http://localhost:3100`, compte `editor@drama.local` (rôle EDITOR).
Les cas réservés au rôle ADMIN (comptes, audit) sont exécutés avec un compte ADMIN de recette dédié **à créer**
(jamais `admin@drama.local`).

### 6.1 B-13 — Authentification, rôles

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-210 | Redirection non connecté | Ouvrir `/series` | `/login?redirect=/series` | P1 |
| RC-211 | Mauvais mot de passe | Formulaire | « Identifiants incorrects. », pas d'étape TOTP | P1 |
| RC-212 | Étape TOTP | Bon mot de passe | Écran « Code de vérification », 6 cases numériques, case « Se souvenir de cet appareil pendant 30 jours » | P1 |
| RC-213 | Code TOTP faux ou incomplet | 000000 ; 1 chiffre | Message d'erreur explicite ; bouton « Vérifier » inactif tant que 6 chiffres ne sont pas saisis (voir DEF) | P1 |
| RC-214 | Connexion réussie | Code courant | Redirection `/series` ; cookie `drama_admin_token` `SameSite=Strict` (Secure hors dev) ; `GET /admin/auth/me` → 200 | P1 |
| RC-215 | Défi à usage unique (API) | Rejouer `totp/verify` avec le même `challengeToken` | 401 `CHALLENGE_USED` | P1 |
| RC-216 | Déconnexion | « Se déconnecter » | `POST /admin/auth/logout` → 204, cookie supprimé, ancien jeton → 401 (révocation Redis) | P1 |
| RC-217 | Page réservée ADMIN | `/administration` en EDITOR | « Droits insuffisants » sans appel API ; `GET /admin/accounts` → 403 `FORBIDDEN_ROLE` | P1 |
| RC-218 | Appareil de confiance (v1.3) | Cocher « Se souvenir », se reconnecter ; `/account` | Pas de TOTP à la reconnexion ; appareil listé et révocable (fonction en cours, NT si non livrée) | P2 |

### 6.2 B-01 — Catalogue

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-220 | Liste et filtres | `/series`, `?status=DRAFT`, `?q=QA-` | Table paginée (20), filtres dans l'URL, étiquettes de statut | P1 |
| RC-221 | Création | « Nouvelle série », titre `QA-Recette <date>`, synopsis, genres, langue, âge, territoires `AQ` | `POST /admin/series` → 201 brouillon, slug dérivé | P1 |
| RC-222 | Validation | Titre vide ; langue invalide | Messages de validation côté client, 400 côté API | P1 |
| RC-223 | Champs de monétisation | EDITOR modifie épisodes gratuits / coût | Champs désactivés dans le formulaire ; `PATCH` → 403 `FORBIDDEN_FIELDS` | P1 |
| RC-224 | Publication sans épisode prêt | « Publier » | 409 `SERIES_NO_READY_EPISODE` affiché en clair | P1 |
| RC-225 | Publication et archivage | Après un épisode READY | Statut « Publiée » visible dans l'app ; « Archiver » retire la série du catalogue public (404) | P1 |
| RC-226 | Affiches | Upload affiche verticale (presign + PUT) | Aperçu immédiat, URL enregistrée | P1 |

### 6.3 B-02 — Épisodes, upload, transcodage

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-230 | Upload d'un fichier | Déposer `qa-episode.mp4` (1080×1920) | `POST /episodes` → `upload-url` → PUT direct → `uploaded` ; statut UPLOADED → PROCESSING → READY (polling 5 s) | P1 |
| RC-231 | Garde `uploaded` avant PUT (API) | `POST /uploaded` sans fichier | 409 `SOURCE_NOT_UPLOADED` | P1 |
| RC-232 | Résultat du transcodage | Épisode READY | `hlsKey` (`hls/{id}/master.m3u8` 360p-1080p), `previewKey`, vignette, durée (ffprobe) ; aperçu HLS dans le back-office | P1 |
| RC-233 | Visibilité dans l'app après publication | Série publiée, épisode READY | Épisode visible dans `GET /series/{id}/episodes` et lisible (voir DEF sur `publishedAt`) | P1 |
| RC-234 | Réordonnancement, renommage, suppression | Glisser-déposer, renommer, supprimer | `PUT …/order`, `PATCH`, `DELETE` ; renumérotation 1..n ; fichiers HLS supprimés | P1 |
| RC-235 | Échec et relance | Fichier corrompu | Statut FAILED avec `transcodeError`, bouton « Relancer le transcodage » | P1 |
| RC-236 | Upload en masse | 3+ fichiers | 3 envois simultanés max, progression par fichier et globale, avertissement avant de quitter | P1 |

### 6.4 B-03 — Sous-titres

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-240 | Import SRT | Panneau Sous-titres, `.srt`, langue fr | 201, conversion WebVTT, fichier servi en `text/vtt` depuis le stockage | P1 |
| RC-241 | Import VTT autre langue | `.vtt`, langue en | Deux pistes listées (FR, EN) avec libellés natifs | P1 |
| RC-242 | Remplacement | Ré-importer fr | Avertissement « existe déjà : le nouveau fichier le remplacera », même id de piste | P1 |
| RC-243 | Fichier invalide | `.txt` | 400 `SUBTITLE_INVALID_FORMAT` affiché | P1 |
| RC-244 | Exposition publique | `GET /series/{id}/episodes`, `/play` | `subtitles[{language,label,url}]` ; app : piste sélectionnable | P1 |
| RC-245 | Aperçu synchronisé | Lecteur HLS du back-office, sélecteur de langue | Cues affichées au bon moment | P2 |

### 6.5 B-05 — Mise en avant

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-250 | Bannière par pays | Créer `QA-Bannière` (série, pays AQ, active) | Listée avec état de diffusion ; `GET /home` : présente avec `X-Country: AQ`, absente avec `TG` | P1 |
| RC-251 | Rangée manuelle par pays | Créer rangée MANUAL `qa-recette` (titres fr/en, pays AQ) | Clé proposée automatiquement ; présente/absente selon le pays ; titre selon `Accept-Language` | P1 |
| RC-252 | Validation des rangées | GENRE sans genre ; ordre incomplet | 400 `HOME_ROW_GENRE_REQUIRED` ; 400 `HOME_ORDER_MISMATCH` | P1 |
| RC-253 | Réordonnancement | Glisser-déposer bannières / rangées | `PUT …/order`, ordre reflété dans l'app | P1 |
| RC-254 | Aperçu | Onglet Aperçu, pays AQ, langue EN | Rendu identique à `GET /home` (cadre téléphone), sans cache | P1 |
| RC-255 | Invalidation du cache | Modifier une rangée puis `GET /home` | Changement visible immédiatement (< 60 s au pire) | P1 |

### 6.6 B-13 — Comptes internes et journal d'audit (rôle ADMIN de recette)

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-260 | Création d'un compte | `/administration`, « Nouveau compte », rôle SUPPORT | Mot de passe affiché une seule fois ; première connexion → enrôlement TOTP | P1 |
| RC-261 | Modification, désactivation | Changer le rôle ; désactiver | Compte désactivé refusé à la connexion ; auto-verrouillage impossible (`ADMIN_SELF_LOCKOUT`), dernier admin protégé (`LAST_ADMIN`) | P1 |
| RC-262 | Réinitialisation TOTP et mot de passe | Boutons dédiés | Nouvel enrôlement à la connexion suivante ; appareils de confiance révoqués | P1 |
| RC-263 | Journal d'audit | Filtres auteur, action `series.`, période | Chaque mutation de la campagne (création série, upload, sous-titres, bannière…) avec ancienne/nouvelle valeur et auteur | P1 |

### 6.7 B-04 / B-11 v0 (information, P2)

| ID | Cas | Étapes | Résultat attendu | Prio |
| --- | --- | --- | --- | --- |
| RC-270 | Planification | Date future sur une série ; `/schedule` | Absente du catalogue public jusqu'à la date ; bascule par la tâche planifiée (< 60 s) | P2 |
| RC-271 | Tableau de bord | `/dashboard` 7 / 30 jours | Tuiles cohérentes avec `GET /admin/stats/overview` ; états vide/erreur | P2 |
| RC-272 | Aide | `/help` | Guide rendu avec sommaire | P3 |

## 7. Critères d'acceptation §15.3 — liste de contrôle

| # | Critère | Comment on le vérifie | État au 30/10/2026 |
| --- | --- | --- | --- |
| 1 | Toutes les fonctions P1 validées sur ≥ 8 appareils Android dont 3 d'entrée de gamme | Toutes les lignes P1 de ce cahier en OK sur les 8 colonnes | Non atteint : 3 appareils disponibles (1 entrée de gamme émulé), P1 partiellement livrées |
| 2 | Parcours d'achat testé de bout en bout (sandbox Google Play, mobile money réel à faible montant) | Cahier des sprints 7-9 | Sans objet (monétisation non livrée) |
| 3 | Aucun défaut bloquant ou majeur ouvert ; mineurs listés avec date de correction | `docs/recette/defauts.md` | Voir rapport de campagne |
| 4 | Objectifs de performance §12 atteints en test de charge (p95 < 300 ms, 5 000 simultanés) | Campagne de charge dédiée (k6) | Non testé |
| 5 | Bêta fermée de 2 semaines, ≥ 100 testeurs | Firebase App Distribution / Play test interne | Non démarré |
| 6 | Garantie 3 mois après mise en ligne | Contrat | — |

Critères techniques §7 suivis à chaque campagne : démarrage à froid < 2,5 s sur 2 Go (RC-130), première image < 1,5 s en 4G (RC-051), APK/AAB < 30 Mo (RC-131), sessions sans plantage ≥ 99,5 % (RC-132), 60 i/s (RC-133).
