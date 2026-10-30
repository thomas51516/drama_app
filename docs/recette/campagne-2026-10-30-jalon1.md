# Campagne de recette n° 2 — jalon 1 — 30 octobre 2026 (S06-QA-01)

Cahier appliqué : `docs/recette/cahier-de-recette.md` **v1.1** (cas du sprint 5 ajoutés : §4.14 à §4.17, §5.5, §6.8).
Défauts : `docs/recette/defauts.md`. Preuves : `docs/recette/evidence/jalon1/`. Rapport client : `rapport-jalon-1.md`.

Commit testé : **`954ae8e`** (HEAD à 12:00 UTC ; code identique à `750ac92` + un commit de documentation). L'APK a
été construit depuis un arbre de travail propre de ce commit (`git worktree add … HEAD`), indépendamment des
modifications non commitées des agents backend, web et Android qui travaillaient en parallèle.

## 1. Environnement

| Élément | Valeur |
| --- | --- |
| Backend `:3000` (dev partagé) | NestJS `nest start --watch` sur l'arbre de travail du dépôt : code **HEAD propre** de 12:00 à 12:25 (OpenAPI 1.3.0, 89 routes, identique à `docs/api/openapi.v1.json`), puis **indisponible de 12:25 à 12:33** (refactorisation en cours : 70 fichiers modifiés, `dist/main` ne démarrait plus), puis code de travail **1.4.0 / 104 routes** (sprint 6-7 non committé). La passe API (§5) a été exécutée entre 12:02 et 12:11 sur le code HEAD. |
| Backend `:3001` (référence QA) | Instance **HEAD** lancée par la QA depuis le worktree propre (`npm ci`, `prisma generate`, `node dist/main`, `PORT=3001`, workers transcodage / planificateur / file push désactivés, même PostgreSQL et Redis). Utilisée par les émulateurs à partir de 12:35 (APK construit avec `-PdramaApiBaseUrl=http://10.0.2.2:3001/`). |
| Fournisseurs | `MEDIA_SIGNER=plain`, `PLAYBACK_URL_TTL_SECONDS=300`, `RATE_LIMIT_ENABLED=true`, `SMS_PROVIDER` console, `PUSH_PROVIDER=log`, `TRANSCODE_PROVIDER=local`, `CDN_BASE_URL=http://192.168.1.145:9000/drama-media` ; `/health` : database et redis `up` |
| Back-office | Nuxt dev sur `:3100`, `NUXT_PUBLIC_API_MOCK=false`, compte `editor@drama.local` (EDITOR), **une seule connexion** (API, `rememberDevice: true`, jeton réinjecté dans les cookies `drama_admin_token` / `drama_admin_device`), Chrome 154 headless via puppeteer-core 25.16 en 1366×900 |
| APK | `app-debug.apk` depuis le worktree `954ae8e` (`:app:assembleDebug`, JDK 17, propriétés par défaut) : **22 582 871 octets (21,5 Mio)**, SHA-256 `dabc97ed5fc125ae…`, `versionName 0.3.0`, `versionCode 1`, `minSdk 26`, `targetSdk 36`. Variante identique construite avec `-PdramaApiBaseUrl=http://10.0.2.2:3001/` pour viser le backend HEAD (`app-debug-3001.apk`). |
| E36 | AVD `Medium_Phone_API_36.1`, Android 16 (API 36), 1080×2400 @420 dpi, 2 Go (2,5 Go vus), `-no-window -gpu swiftshader_indirect`, locale `en-US`, TalkBack installé |
| E29 | AVD `QA_LowEnd_API29`, Android 10 (API 29), 720×1600 @320 dpi, 2 Go, 2 cœurs, GPU logiciel, locale `en-US`, démarrage sans instantané |
| CM6 | TECNO CM6 (série `137972555Y011409`) : **vu en USB à 11:56** (DRAMA 0.3.0 installée par l'agent Android à 11:51:36, écran éteint, lanceur au premier plan), **débranché à partir de 12:01** et jamais revenu (absent de `lsusb`, `adb connect 192.168.1.71:5555` refusé : débogage Wi-Fi non activé). Aucun cas exécuté sur le téléphone. |
| Hôte | 16 cœurs, 15 Go de RAM, partagé avec les compilations Gradle des autres agents : charge moyenne de 2 à **158** pendant la campagne. Les émulateurs ont été tués **cinq fois** (chien de garde QEMU « hanging thread » à 12:01, 12:06, 12:18, 12:27 ; OOM-killer du noyau à 13:13 heure locale sur `qemu-system-x86` à 4,1 Go). Les relances se font sur une fenêtre de charge < 8, un émulateur à la fois. |

## 2. Synthèse

| Cible | Lignes exécutées (OK + KO) | OK | KO | NT (motif principal) |
| --- | --- | --- | --- | --- |
| E36 — émulateur API 36, build HEAD | 57 | 56 | 1 | 28 (émulateur perdu trois fois : hôte saturé par les compilations concurrentes ; parcours compte et TalkBack interrompus) |
| E29 — émulateur entrée de gamme API 29, build HEAD | 6 | 5 | 1 | 80 (deux pertes d'émulateur par OOM, puis **AVD partagé avec l'agent Android à partir de 15:01**, qui y a installé son propre build : résultats ultérieurs écartés) |
| CM6 — TECNO (téléphone du client) | 0 | — | — | toutes : téléphone débranché de 12:01 à 14:59 puis utilisé par l'agent Android (lecture en cours à 15:00), de nouveau absent à 15:05 |
| API (`:3000` HEAD, `:3001` HEAD) | 43 | 40 | 3 | 2 |
| Back-office (`:3100`) | 17 | 17 | 0 | 2 (TOTP / déconnexion UI : connexion unique ; boîte support : rôle) |
| **Total** | **123** | **118** | **5** | **112** |

Les lignes « OK (partiel) » comptent comme OK avec la réserve notée. Les KO Android (RC-320) et API (RC-173, RC-179,
RC-181, RC-192) correspondent tous à des défauts **mineurs** (DEF-011, DEF-002, DEF-003, DEF-008, DEF-009).

Défauts : **0 bloquant, 0 majeur ouvert** (DEF-001 corrigé dans HEAD, non retestable sans upload), **9 mineurs
ouverts** (DEF-002, 003, 004, 005, 006, 008, 009, 011, 012), **2 fermés** (DEF-007 i18n, DEF-010 OpenAPI). Aucun plantage
de l'application sur 63 lignes Android.

Faits marquants de cette campagne :

1. Le sprint 5 est visible et fonctionnel sur le build HEAD : interface entièrement traduite (EN vérifié, ES partiellement), écran Paramètres avec langue immédiate et interrupteurs synchronisés par `PATCH /me` (retour arrière hors ligne correct), centre d'aide (FAQ par catégorie, recherche, formulaire avec validation), demande de permission de notification au bon moment, jeton push enregistré.
2. DEF-007 (mélange de langues) est fermé ; DEF-010 (OpenAPI) est fermé ; DEF-001 (majeur) est corrigé dans le code mais ne pourra être refermé qu'après un upload de recette.
3. Deux nouveaux défauts mineurs : jeton push enregistré deux fois (DEF-011) et puces de genre non traduites (DEF-012).
4. Les mesures de démarrage à froid sur l'émulateur entrée de gamme (médiane 2,85 s en **debug**, hôte partagé) dépassent la cible de 2,5 s ; la mesure de référence de l'agent Android (build `benchmark` R8 + profil de base : 569 ms sur le même AVD) reste à reproduire par la QA sur un hôte calme et sur un vrai téléphone 2 Go.
5. Le téléphone du client et l'émulateur entrée de gamme n'ont pas pu être exploités par la QA de façon exclusive : la recette du jalon sur appareil réel reste à faire (voir §8).

## 3. Mesures

| Mesure | E36 (API 36, 2 Go) | E29 (API 29, 2 Go, 2 cœurs) | CM6 | Cible |
| --- | --- | --- | --- | --- |
| Démarrage à froid `am start -W -S` (`TotalTime`), build **debug** | 1 547 ms à l'installation ; **médiane 1 222 ms** (1 175 – 1 300, 6 relevés) ; 1 904 ms juste après un changement de langue | 3 659 ms à l'installation ; **médiane 2 850 ms** (1 143 – 3 127, 7 relevés, charge hôte 1,6 – 1,9) | non mesuré | < 2 500 ms sur 2 Go (référence agent Android : 569 ms en build `benchmark` + profil de base, 699 ms en debug, même AVD, 30/10) |
| Première image, épisode à froid (`first_frame … preloaded=false`) | **315 ms** (ép. 1, rendition la plus basse forcée au démarrage puis Auto · 540p) | non mesuré sur le build HEAD | — | < 1 500 ms en 4G réelle |
| Première image, épisode préchargé (`preloaded=true`) | 590 ms (enchaînement auto ép. 2, `ready_ms=521`, hôte chargé) ; **118 ms** (retour sur l'ép. 2) | — | — | — |
| Préchargement du suivant | `preload completed index=1` 315 ms après le début de l'ép. 1 | — | — | avant le balayage |
| PSS accueil (`dumpsys meminfo`) | 131,2 Mo (après lecture) | **107,8 Mo** | — | — |
| PSS pendant / après la lecture | **175,5 Mo** après 3 pages du lecteur (ép. 1 → 2 → 3 verrouillé → 2) | — | — | stable, < 200 Mo en debug |
| Fluidité (`gfxinfo`) | non significatif (6 images capturées, hôte saturé) | non mesuré sur le build HEAD | — | janky < 10 % |
| Taille APK debug | 22 582 871 o (21,5 Mio), SHA-256 `dabc97ed…` | idem | — | AAB release < 30 Mo (3,9 Mo mesurés par l'agent Android) |
| Plantages de l'application (`logcat -b crash`) | **0** | **0** (5 exceptions de l'outil `uiautomator`, hors application) | 0 dans le tampon lu à 11:56 | 0 |
| Latences API vues de l'app (`Http`) | `/auth/guest` 39 ms, `/home` 75–126 ms, `/series` 96–506 ms, `/search` 23–511 ms, `/help/faq` 505 ms, `PATCH /me` 9–62 ms | `/home` 61 ms | — | p95 < 300 ms (test de charge à part ; les valeurs > 300 ms coïncident avec les pics de charge de l'hôte) |
| Limitation de débit `/auth/guest` depuis `[::1]` | 429 `RATE_LIMITED` à la 30e requête de la fenêtre, `Retry-After: 450` ; `127.0.0.1` et `/home` non affectés | | | 30 / IP / 15 min |

Les temps d'émulateur (décodage logiciel, réseau local) ne valent pas pour le critère M-12 « 4G réelle » ; le démarrage
à froid en debug sans profil de base n'est pas représentatif du livrable (AAB release + R8 + `baseline-prof.txt`).

## 4. Résultats détaillés — Android

Légende : OK / KO / NT ; preuve entre parenthèses (`e36-…png` = E36, `e29-…png` = E29 dans `evidence/jalon1/`, `LC` =
Logcat). E36 : session interactive 12:12 → 12:27 (backend `:3000`, coupé à 12:25) puis passe scriptée 13:16 → 13:23
(backend `:3001`) ; une troisième passe (14:32) a été perdue par OOM après 2 minutes. CM6 : aucun cas (téléphone
débranché, voir §1).

| ID | Cas | E36 | E29 | CM6 | Preuve / remarque |
| --- | --- | --- | --- | --- | --- |
| RC-001 | Création de l'invité | OK | OK | NT | E36 LC 12:12:15 `POST /auth/guest` 201 (39 ms), `Session: guest session created user=01a18cb9…` ; idem 13:16:31 sur `:3001` ; E29 LC 14:56:48 `guest session created user=01a18d50…` |
| RC-002 | Persistance de la session | OK | NT | NT | E36 LC 12:12:21 `guest session ready user=01a18cb9…` sans nouvel appel `/auth/guest` |
| RC-004 | Refresh rejeté | NT | NT | NT | installations fraîches : non reproduit (DEF-006 reste ouvert) |
| RC-005 | Identifiant invité visible | OK | NT | NT | `e36-21-profile-guest.png` « Guest id: 01a18cc2… », trois options de connexion |
| RC-010 | Chargement de l'accueil | OK | NT | NT | `e36-01-home.png` ; LC `GET /home` 200 (75 ms) ; bannière puis Trending / New releases / Romance / Drama |
| RC-011 | Bannière → fiche | OK | NT | NT | `e36-07-series.png` ; LC `series_view{source=home}` |
| RC-012 | Rangées typées, langue | OK | NT | NT | appareil `en-US` : interface **et** rangées en anglais → **DEF-007 fermé** |
| RC-013 | Continuer à regarder | OK | NT | NT | `e36-18-home-continue.png` : rangée « Continue watching », badge « Episode 2 » (ép. 1 terminé exclu → **RC-093 OK**) |
| RC-016 | Hors-ligne avec cache | OK (partiel) | NT | NT | backend coupé : Ma liste servie du cache avec bandeau « Offline: showing your cached list » + « Retry » (`e36-19-mylist.png`) ; accueil sans cache (install fraîche) : état « No connection » + « Retry », pas de plantage (`e36-28-first-launch-offline.png`) ; accueil **avec** cache non observé |
| RC-020 | Lecture auto du flux | NT | NT | NT | onglet ouvert pendant la coupure du backend : état d'erreur propre « No connection… Retry » (`e36-20-feed.png`, = RC-026 OK) ; extrait non rejoué ensuite (émulateur perdu) ; vérifié en campagne 1 |
| RC-022 / 024 | Balayage, pagination du flux | NT | NT | NT | un seul élément dans le flux |
| RC-030 | Suggestions | OK | NT | NT | `e36-02-search-suggest.png` ; LC `GET /search/suggest?q=lag` 200 → « Le Secret du Lagon » |
| RC-031 | Résultats par titre | OK | NT | NT | `e36-03-search-results.png` « 1 result » ; LC `Analytics: search{query=lag, result_count=1}` |
| RC-032 | Recherche par genre (puce) | OK | NT | NT | `e36-04-search-genre.png` ; LC `GET /search?q=romance&genre=romance` 200 (l'app envoie `q` = clé du genre, ce qui contourne DEF-002). Puces en français sur interface anglaise → **DEF-012** |
| RC-034 | Aucun résultat | OK | NT | NT | `e36-05-search-empty.png` « No series for “zzzzqqq” in romance. » (le filtre de genre reste actif après effacement du texte : à signaler à l'UX, pas un défaut) |
| RC-035 | Historique de recherche | OK | NT | NT | `e36-06-search-history.png` : « Recent searches », suppression unitaire (`Remove the search …`) et « Clear all » |
| RC-036 | Brouillon exclu | OK | NT | NT | « Abidjan » → aucun résultat |
| RC-040 | Contenu de la fiche | OK | NT | NT | `e36-07-series.png` : 12+, 3 episodes, 2 free, Romance · Drame, synopsis + « Read more » ; LC `GET /series/{id}` et `/episodes` 200 |
| RC-041 | Grille et statuts | OK | NT | NT | cellules « Episode 1, Free », « Episode 2, Free », « Episode 3, Locked, 10 coins » (content-desc) |
| RC-042 | Bouton contextuel | OK | NT | NT | « Watch » puis « Resume episode 2 » après lecture (`e36-17-series-resume.png`) |
| RC-043 | Épisode verrouillé | OK | NT | NT | `e36-16-player-ep3-locked.png` ; LC `POST /play` 403, `play resolution failed index=2: Locked(coinCost=10)` ; aucune lecture |
| RC-044 | Lien profond | NT | NT | NT | émulateur perdu avant l'exécution (deux fois) |
| RC-046 | Fiche hors-ligne | NT | NT | NT | — |
| RC-050 | Plein écran portrait, image entière | OK | NT | NT | `e36-10-player-ep1.png` : vidéo entière (Fit), barre d'état visible, commandes dans les bandes ; LC `first_frame index=0` |
| RC-051 | Démarrage < 1,5 s | OK (indicatif) | NT | NT | E36 `startup_ms=315` à froid (360p forcée au démarrage, `startup_lowest=true` → `false` après la première image, puis Auto · 540p) ; 4G réelle à faire sur CM6 |
| RC-052 | Balayage suivant / précédent | OK | NT | NT | LC `page settled index=1 (was 2)` ; retour sur l'ép. 2 → lecture, `first_frame index=1 startup_ms=118 preloaded=true` |
| RC-053 | Préchargement du suivant | OK | NT | NT | LC `preload completed index=1` 0,3 s après le démarrage de l'ép. 1 ; enchaînement `first_frame index=1 startup_ms=590 ready_ms=521 preloaded=true` (hôte chargé : > 500 ms visés), balayage retour 118 ms |
| RC-054 | Enchaînement automatique | OK | NT | NT | LC 12:23:55 `ended index=0`, `episode_complete`, 12:23:58 `next episode index=1` (3 s) |
| RC-055 | Enchaînement vers un verrouillé | OK | NT | NT | LC 12:24:22 `ended index=1` → page verrouillée ép. 3, pas de plantage |
| RC-056 | Retour et libération | OK | NT | NT | LC `progress sent … position_ms=6539`, `engine released` |
| RC-057 / 058 | Coupure réseau / API pendant la lecture | NT | NT | NT | la coupure du backend (12:25) est survenue hors lecture : écrans d'erreur propres, aucun plantage ; lecture sous coupure non rejouée |
| RC-059 / 060 | URL signée | NT | NT | NT | pause de 5 min non réalisée (émulateur perdu) ; vérifié en campagne 1 sur E29 |
| RC-061 | Mémoire pendant la lecture | OK | OK (partiel) | NT | E36 PSS **175,5 Mo** après 3 pages du lecteur, 131,2 Mo à l'accueil ensuite (< 200 Mo) ; E29 **107,8 Mo** à l'accueil (14:57), lecture non mesurée sur le build HEAD |
| RC-062 | Rotation | NT | NT | NT | — |
| RC-070 | Pause / reprise | OK | NT | NT | position « 0:23 » stable 3 s puis reprise (`e36-11-paused.png`) |
| RC-071 | ±10 s | NT | NT | NT | double appui simulé par deux `input tap` adb trop espacés sous charge (0:25 → 0:27 → 0:29 = lecture continue, aucune recherche) ; vérifié OK en campagne 1 ; à refaire au doigt sur CM6 |
| RC-072 | Barre de progression | NT | NT | NT | — |
| RC-073 | Vitesse | OK | NT | NT | `e36-12-speed-menu.png` (0.75x → 2x) ; LC `settings applied speed=1.5` ; puce « 1.5x » conservée sur l'épisode suivant |
| RC-074 | Qualité | OK | NT | NT | `e36-13-quality-menu.png` ; choix 360p → LC `selected video format 360x640 … cap_short_side=360`, puce « 360p » ; « Auto · 540p » en mode auto |
| RC-075 | Son / Muet | NT | NT | NT | bouton « Sound » / `Mute` présent, non actionné |
| RC-076 | Menu Paramètres | OK | NT | NT | `e36-15-settings-sheet.png` : Subtitles FR, Speed 1.5x, Quality 360p ; fermeture par Retour |
| RC-080 | Sous-titres auto (appareil fr) | NT | NT | NT | émulateurs en `en-US` ; à faire sur CM6 |
| RC-081 | Appareil sans piste dans sa langue | OK | NT | NT | LC `subtitles mode=Auto offered=[fr] active=off`, puce « CC Off » |
| RC-082 | Choix manuel persistant | OK (partiel) | NT | NT | `e36-14-cc-menu.png` « Off / Français (FR) » → puce « CC FR », LC `selected_text=fr` ; conservé sur l'épisode suivant (`e36-16`) ; après redémarrage : NT |
| RC-083 / 084 | Plusieurs langues, lisibilité | NT | NT | NT | une seule piste sur le seed |
| RC-090 | Envoi de la progression | OK (partiel) | NT | NT | envoi à la sortie observé ; cadence 5 s vérifiée en campagne 1 |
| RC-091 / 092 | Reprise locale / cross-device | NT | NT | NT | `resumePositionSeconds` vérifié côté API (RC-178) |
| RC-093 | Épisode terminé | OK | NT | NT | voir RC-013 |
| RC-100 | Ajouter à Ma liste | OK | NT | NT | LC `PUT /me/favorites/…` 204, `Analytics: favorite{added=true, source=home}` ; boîte système `POST_NOTIFICATIONS` affichée juste après (`e36-08-series-fav.png`) = **RC-322 OK** |
| RC-101 | Onglet Ma liste | OK | NT | NT | `e36-19-mylist.png` : carte, « 3 ep. », bouton « Remove … from My list » |
| RC-102 | Retrait hors-ligne | NT | NT | NT | — |
| RC-103 | J'aime | OK | NT | NT | « Like, 1 » → « Like, 2 » → « Like, 1 » (content-desc et compteur) |
| RC-104 | Partage | NT | NT | NT | appui masqué par la boîte de permission ; vérifié en campagne 1 |
| RC-105 | Favoris conservés au rattachement | OK (API) | NT | NT | API RC-156 : `total=1` après `register` `linked=true` |
| RC-110 | Écran Profil invité | OK | NT | NT | `e36-21-profile-guest.png` : Google, téléphone (« 6-digit code by SMS »), e-mail, entrées Settings / My notifications / Help |
| RC-111 | Inscription e-mail | NT | NT | NT | formulaire atteint (`e36-39-email-form.png`, onglets « I already have an account / Create an account », champ mot de passe « at least 8 characters ») ; soumission non réalisée (saisie adb interrompue, puis émulateur perdu) ; parcours complet vérifié par l'API (RC-156 à 158) |
| RC-112 à 118 | Connexion, erreurs, OTP, Google, déconnexion | NT | NT | NT | idem ; règles vérifiées par l'API (RC-157 à 162) |
| RC-120 à 123 | Carte de profil, nom, langue serveur, suppression | NT | NT | NT | `PATCH /me` et `DELETE /me` vérifiés par l'API (RC-158, 163, 197) |
| RC-124 | Préférences de notification | OK | NT | NT | voir RC-303 |
| RC-130 | Démarrage à froid | OK | OK | NT | E36 : 1 547 / 1 394 ms à l'installation (création de l'invité incluse) ; **médiane 1 222 ms** sur 6 relevés avec données (1 175 – 1 300). E29 (2 Go, 2 cœurs, GPU logiciel) : 3 659 ms à l'installation, puis **3 127 / 2 692 / 3 102 ms** (14:56, charge hôte 1,6) et 2 956 / 1 143 / 2 744 ms (15:01) : **médiane 2 850 ms sur 7 relevés, cible 2 500 ms dépassée** sur cet émulateur (voir §3) |
| RC-131 | Taille du livrable | OK (debug) | OK (debug) | — | 21,5 Mio en debug ; AAB release mesuré par l'agent Android à 3,9 Mo (S06-A2-03), non remesuré ici |
| RC-132 | Plantages | OK | OK | NT | E36 : 0 `FATAL EXCEPTION` sur les deux passes (tampon `crash` relu avant chaque perte d'émulateur). E29 : 0 plantage de l'application ; les 5 `FATAL EXCEPTION` du tampon `crash` (15:03) proviennent de l'outil `uiautomator dump` (« UiAutomationService already registered », deux sessions d'automatisation concurrentes sur le même AVD), pas de `com.drama.app` |
| RC-133 | Fluidité | NT | NT | NT | `gfxinfo` E36 : 6 images capturées seulement (hôte saturé) : non significatif |
| RC-134 | Compatibilité API 29 | — | NT | — | |
| RC-135 / 306 | Langue de l'appareil, cohérence | OK (partiel) | NT | NT | `en-US` : toute l'interface en anglais (onglets Home / For you / My list / Profile, fiche, lecteur, Profil, Aide) ; Español : Profil, Ajustes, bandeaux (« Sin conexión ») traduits (`e36-23`, `e36-25`) ; reste en français : puces de genre de la recherche (**DEF-012**) et contenus éditoriaux (attendu) |
| RC-136 / 330 | Libellés d'accessibilité | OK | NT | NT | audit `uiautomator` accueil et fiche : 9 cibles cliquables, **0 sans libellé**, 0 < 48 dp ; lecteur : `Video player, episode 1`, `Playback speed: 1x`, `Quality: Auto · 540p`, `Subtitles: Off`, `Share the series`, `Playback settings`, `Mute`, `Position 0:06 of 0:30` |
| RC-300 | Écran Paramètres | OK | NT | NT | `e36-22-settings.png` : 4 langues (radio), 3 interrupteurs, bandeau et boutons de permission |
| RC-301 | Changement de langue immédiat | OK (partiel) | NT | NT | Español appliqué instantanément à l'écran, au Profil et aux bandeaux (`e36-23-settings-es.png`, `e36-25-profile-es.png`) ; `PATCH /me {language}` non observé (hors ligne à ce moment) : vérifié par l'API (RC-158) |
| RC-302 | Persistance de la langue | NT | NT | NT | redémarrage en espagnol non réalisé (émulateur perdu) |
| RC-303 | Interrupteurs de notification | OK | NT | NT | LC 13:20:56 et 13:21:01 `PATCH /me` 200 à chaque bascule ; ligne entière cliquable |
| RC-304 | Retour arrière hors ligne | OK | NT | NT | `e36-24-toggle-offline.png` : bascule hors ligne → `PATCH /me` échoue, interrupteur revenu à « activé », bandeau « Sin conexión » |
| RC-305 | Notifications coupées côté système | OK | NT | NT | « Notifications are turned off for DRAMA on this phone. » + « Allow notifications » / « Open phone settings » (`e36-22`) |
| RC-310 | FAQ | OK | NT | NT | LC `GET /help/faq?lang=en` 200 ; onglets FAQ / Contact / My requests, catégories Account, Coins, VIP, Playback, Payment, Content avec une question chacune (dump uiautomator 13:16 ; capture perdue) |
| RC-311 | Recherche locale FAQ | OK (partiel) | NT | NT | « pieces » sur la FAQ anglaise → état vide « No answer for “pieces”. Try another word or contact us. » + « Ask support » (`e36-31-help-search.png`) ; insensibilité aux accents non vérifiable en anglais |
| RC-312 | Formulaire de contact | OK (partiel) | NT | NT | validation en clair « Enter a subject of at least 3 characters. », « Describe your issue in at least 10 characters. » (`e36-33-help-contact-errors.png`) ; catégories, sujet, message, e-mail facultatif (`e36-32`) ; envoi depuis l'app non abouti (saisie adb tronquée) ; `POST /help/contact` 201 vérifié par l'API (RC-208) |
| RC-313 | Mes demandes | NT | NT | NT | API RC-209 OK |
| RC-314 / 315 | Limite quotidienne, aide hors ligne | NT | NT | NT | — |
| RC-320 | Enregistrement du jeton push | **KO** (mineur) | **KO** (mineur) | NT | LC `Push: FCM token refreshed`, `PUT /me/devices/push` 204, `push token registered user=…` — **deux fois** en 12 ms à chaque première ouverture (12:12:18, 13:16:33) → **DEF-011** ; E29 14:56:53 idem (`PUT /me/devices/push` ×2) |
| RC-321 | Jeton suivi du compte | NT | NT | NT | déconnexion non réalisée |
| RC-322 | Permission `POST_NOTIFICATIONS` | OK | NT | NT | demandée après le premier ajout à Ma liste, jamais au lancement (`e36-08-series-fav.png`) |
| RC-323 | Mes notifications | NT | NT | NT | API RC-194 OK (liste vide, `unreadCount`) |
| RC-324 à 326 | Réception, liens profonds, canaux | NT | NT | NT | — |
| RC-331 | Parcours TalkBack | NT | NT | NT | TalkBack activé (`dumpsys accessibility`: `Bound services: TalkBack`), cadre de focus vert visible (`e36-48-talkback-home.png`) mais la boîte « Allow Android Accessibility Suite to send you notifications? » a pris le focus et l'émulateur a été perdu avant le parcours ; à faire sur CM6 |
| RC-332 | Taille de police 200 % | OK (partiel) | NT | NT | Profil à 200 % : textes agrandis, cartes et boutons intacts, rien de tronqué (`e36-44-home-font200.png`) ; accueil et fiche non capturés (même capture répétée, émulateur en difficulté) |
| RC-333 | Cibles tactiles | OK | NT | NT | 0 cible < 126 px (48 dp à 420 dpi) sur accueil et fiche |
| RC-334 | Interrupteurs et radios | NT | NT | NT | — |

## 5. Résultats détaillés — API (robustesse, §8.4, contrat v1.3)

Exécution 12:02 → 12:11 UTC contre `:3000` (code HEAD), puis `127.0.0.1` après le test de limitation de débit.
Rappel : les appels `localhost` passent par `[::1]`, donc la limite de 30 invités / 15 min a été consommée en partie
par les passes précédentes (429 à la 12e requête du lot dédié, 30e de la fenêtre).

| ID | Cas | Résultat | Observé |
| --- | --- | --- | --- |
| RC-150 | Validation `/auth/guest` | OK | `{}` → 400 « deviceId must be longer than or equal to 8 characters », « must be a string » ; propriété inconnue → « property extra should not exist » |
| RC-151 | Routes protégées sans jeton | OK | `/me`, `/play`, `PUT /me/favorites/{id}` → 401 `UNAUTHENTICATED` |
| RC-152 | Jeton altéré / `alg:none` / tronqué | OK | 401 `INVALID_TOKEN`, 401 `INVALID_TOKEN`, 401 `UNAUTHENTICATED` (jeton tronqué sans point = « Missing bearer token », acceptable) |
| RC-153 | Séparation des audiences | OK | jeton utilisateur sur `/admin/series` → 401 `INVALID_ADMIN_TOKEN` ; jeton admin sur `/me` → 401 `INVALID_TOKEN` |
| RC-154 | Rotation du refresh | OK | 1er → 200 nouvelle paire (`{user, tokens}`) ; réutilisation → 401 `REFRESH_TOKEN_REUSED` ; la nouvelle paire est révoquée elle aussi |
| RC-155 | Limitation `/auth/guest` depuis `[::1]` | OK | 429 `RATE_LIMITED` `{rule:auth_guest, limit:30, retryAfterSeconds:450}`, `Retry-After: 450`, `X-RateLimit-*` exposés ; `127.0.0.1` → 201 ; `/home` depuis `[::1]` → 200. IP LAN non utilisée |
| RC-156 | Inscription e-mail rattachant l'invité | OK | 201 `linked=true`, même `user.id`, `type=REGISTERED`, `providers=["email"]` ; **RC-105** : le favori de l'invité est conservé (`GET /me/favorites` `total=1`) |
| RC-157 | Erreurs e-mail | OK | 409 `EMAIL_TAKEN` ; 400 « email must be an email », « password must be longer than or equal to 8 characters » ; 401 `INVALID_CREDENTIALS`. Remarque : `displayName` n'est pas accepté à l'inscription (400) — conforme au contrat (`PATCH /me` ensuite) |
| RC-158 | Second appareil | OK | `login` sans porteur → 200 `linked=false`, même id, `displayName=QA-Robot-J1`, `language=en` retrouvés |
| RC-159 | OTP cycle complet | OK | `{requestId, expiresIn:300, resendAfter:60}` ; renvoi immédiat → 429 `OTP_RESEND_TOO_SOON` ; code lu dans Redis `otp:<requestId>` ; `000000` → 401 `OTP_INVALID_CODE` `attemptsLeft:4` ; bon code → 200 `REGISTERED` ; réutilisation → 404 `OTP_REQUEST_NOT_FOUND` |
| RC-160 | Numéro invalide | OK | 400 « phone must be E.164 » |
| RC-161 | Google | OK | sans `idToken` → 400 ; jeton forgé court → 400 (longueur ≥ 20) |
| RC-162 | Déconnexion | OK (contrat précisé) | `POST /auth/logout` exige désormais le porteur (OpenAPI 1.3.0 : `security: bearer`, 401 sans jeton) ; avec porteur et `refreshToken` → 204 et refresh suivant → 401. Le cahier (« `{}` → 400 ») est à lire « sans jeton → 401 » |
| RC-163 | Suppression différée | OK | 202 `{scheduledFor: +30 j}` ; `GET /me` → `status=DELETION_PENDING` ; refresh → 401 `REFRESH_TOKEN_REUSED` (famille révoquée) |
| RC-170 | Accueil pays / langue | OK | fr : Tendances / Nouveautés / Romance / Drame ; en : Trending / New releases / Romance / Drama ; pt-BR : Tendências / Novidades ; es : Tendencias / Novedades ; avec jeton : mêmes clés ; `X-Country: ZZZZ` → 200 (DEF-008) |
| RC-171 | Fiche et grille | OK | `episodeCount 3`, `freeEpisodeCount 2`, `coinCostPerEpisode 10`, `ageRating PG12` ; épisodes `free/free/locked`, `coinCost 0/0/10`, `subtitles[{fr, Français, url}]`, `publishedAt` renseignés ; id inconnu → 404 `SERIES_NOT_FOUND`. La liste d'épisodes est un tableau nu (pas d'enveloppe `items`) |
| RC-172 | Pagination bornée | OK | 400 « page must not be less than 1 », « pageSize must not be greater than 50 » |
| RC-173 | Recherche | **KO** (genre seul) | `q` vide → 400 ; 300 caractères → 400 ; injection → 200 vide ; `SECRÉT` → trouvé ; brouillon « Abidjan » → 0 ; `genre=romance` sans `q` → **400** (**DEF-002**, contourné par l'app : `q=romance&genre=romance`) ; `suggest?q=lag` → « Le Secret du Lagon » |
| RC-174 | Lecture épisode gratuit | OK | 200 `manifestUrl` MinIO, `expiresAt` = +300 s, `drm.type=none`, `nextEpisodeId`, `resumePositionSeconds` ; manifeste joignable, 4 renditions `#EXT-X-STREAM-INF` |
| RC-175 | Épisode verrouillé | OK | 403 `EPISODE_LOCKED` `{episodeId, seriesId, coinCost:10, freeEpisodeCount:2}` |
| RC-176 | Épisode inconnu | OK | 404 `EPISODE_NOT_FOUND` ; épisode READY sans date : **non retestable sans upload** (DEF-001 : correctif 35f0339 présent dans HEAD, seul épisode sans date en base = `PENDING` d'une série de test e2e, comportement attendu) |
| RC-177 | Progression : validation | OK | « episodeId must be a UUID », « positionSeconds must not be less than 0 », « must not be greater than 86400 », « must be an integer number » |
| RC-178 | Progression et reprise | OK | `PUT /progress` 12 → `/play` `resumePositionSeconds=12` |
| RC-179 | Progression sur épisode verrouillé | **KO** | 200 → **DEF-003** toujours ouvert |
| RC-180 | Expiration réelle des URL signées | NT | signataire `plain` en dev |
| RC-181 | Flux | **KO** (curseur) | 1 élément `{series, episode, previewUrl, previewExpiresAt, isFavorite}` ; `cursor=garbage` → 200 (**DEF-008**) |
| RC-182 | Territoires sur `/play` | NT | pas de série restreinte avec épisode prêt (pas d'upload cette campagne) ; code HEAD inchangé (**DEF-004** ouvert) |
| RC-190 / 191 | Favoris idempotents | OK | 204, 204, `total=1`, `isFavorite=true` ; `DELETE` 204, 204, `total=0` |
| RC-192 | Favori : erreurs | OK (DEF-009) | 404 `SERIES_NOT_FOUND` ; `abc` → 400 `BAD_REQUEST` (**DEF-009** ouvert) |
| RC-193 | J'aime idempotent | OK | `{likes:2, liked:true}` ×2 ; `{likes:1, liked:false}` ×2 |
| RC-194 | Historique des notifications | OK | 200 `{items:[], total:0, page, pageSize, unreadCount:0}` ; id inconnu → 404 `NOTIFICATION_NOT_FOUND` ; sans jeton 401 |
| RC-195 | Appareil push | OK | 204, 204 (upsert) ; `platform:"ios"` → 400 « platform must be one of the following values: android » ; `DELETE` → 204 |
| RC-196 | Événements | OK | `app_open` → 202 `{accepted:1}` ; nom inconnu → 400 (liste des 15 noms) ; `params` 3 010 o → 400 `EVENT_PARAMS_TOO_LARGE` `{index, size, max:2048}` |
| RC-197 | Profil : validation | OK | `language:"xx"` → 400 « language must be one of fr, en, es, pt » ; clé inconnue dans `notificationPreferences` → 400 ; `{newEpisodes:false, offers:true, checkinReminder:false}` → 200 et relu par `GET /me` |
| RC-200 | Format d'erreur | OK | `ApiErrorDto` complet, `x-request-id` sur chaque réponse |
| RC-201 | Corps 2 Mo | OK | 413 |
| RC-202 | Route / méthode inconnues | OK | 404 `NOT_FOUND` « Cannot GET /nope », « Cannot DELETE /home » |
| RC-203 | CORS | OK | origine inconnue : 204 sans `Access-Control-Allow-Origin` ; `http://localhost:3100` autorisée |
| RC-204 | En-têtes de sécurité | OK | HSTS 1 an `includeSubDomains`, `nosniff`, `X-Frame-Options: SAMEORIGIN` |
| RC-205 | Webhook transcodage | OK (partiel) | corps invalide → 400 `VALIDATION_ERROR` (`event` ∈ completed/failed) ; la signature n'a pas été testée avec un corps valide (non signé → 401 vérifié en campagne 1) |
| RC-206 | Santé, docs, métriques | OK | `/health` ok (db 0,8 ms, redis 0,3 ms), `/health/live` 200, `/docs-json` **1.3.0 / 89 routes = fichier committé** (DEF-010 fermé), `/metrics` 200 |
| RC-207 | FAQ publique | OK | fr / en / es / pt : 6 catégories traduites (Compte / Account / Cuenta / Conta…) ; `lang=de` ou `fr-FR` → 400 `VALIDATION_ERROR` « lang must match /^(fr|en|es|pt)$/ » (refus explicite, conforme) ; sans `lang` → 200 en français |
| RC-208 | Contact | OK | `{}` → 400 (sujet ≥ 3, message ≥ 10, catégorie dans la liste) ; corps valide → 201 `{ticketId}` ; sans jeton → 401 |
| RC-209 | Mes demandes / boîte support | OK | `GET /help/tickets` → la demande `QA-Jalon1` en `OPEN` avec `userLabel`, `category`, `email` ; `GET /admin/support/tickets` en EDITOR → 403 `FORBIDDEN_ROLE` `{requiredRoles:[SUPPORT, ADMIN]}` |
| RC-215 | Défi TOTP | — | non rejoué (une seule connexion back-office autorisée par campagne) |
| RC-218 (API) | Appareils de confiance | OK (partiel) | `totp/verify {rememberDevice:true}` → `deviceToken` + `deviceTokenExpiresAt` (+30 j) ; `GET /admin/auth/devices` liste les appareils (`label: Navigateur`, `createdAt`, `expiresAt`) **sans indicateur `current`** (ticket B-13+ en cours) |
| RC-223 / 224 / 231 | Monétisation, publication, upload | — | non rejoués (couverts en campagne 1, pas d'upload cette fois) |


## 6. Résultats détaillés — back-office (fumée, 12:13 → 12:15 UTC)

Parcours automatisé puppeteer : redirection non connecté, mauvais mot de passe, puis **14 pages** avec le jeton de la
connexion unique. Pour chaque page : URL finale, erreurs console, `pageerror`, appels API en erreur, capture.

| ID | Page | Résultat | Preuve / observé |
| --- | --- | --- | --- |
| RC-210 | `/series` non connecté | OK | `web-00-login-redirect.png` : `/login?redirect=/series` |
| RC-211 | Mauvais mot de passe | OK | « Identifiants incorrects. », pas d'étape TOTP (`web-01-login-wrong-password.png`) |
| RC-212 à 216 | Étape TOTP, connexion, déconnexion | NT (UI) | non rejoués dans le navigateur (limite de 5 connexions) ; connexion API `login` → `totp_required` → `totp/verify` 200 avec `deviceToken` ; `GET /admin/auth/me` → EDITOR |
| RC-217 | `/administration` en EDITOR | OK | « Droits insuffisants — réservée au rôle Administrateur », aucun appel API (`web-15-administration.png`) |
| RC-220 | `/series` | OK | « Catalogue — séries », 2,2 s, 0 erreur (`web-02-series.png`) |
| RC-221 | `/series/new` | OK (rendu) | formulaire « Nouvelle série » (`web-03-series-new.png`) ; création non rejouée |
| RC-220 | `/series/{id}` | OK | « Le Secret du Lagon » (`web-04-…png`) |
| RC-232 | `/series/{id}/episodes` | OK | « Épisodes », 4,7 s (polling), 3 épisodes prêts (`web-05-…png`) |
| — | `/episodes` | OK | « Épisodes » (`web-06-episodes.png`) |
| RC-240 | `/subtitles` | OK | « Sous-titres » (`web-07-subtitles.png`) |
| RC-250 | `/featured` | OK | « Mise en avant » (`web-08-featured.png`) |
| RC-270 | `/schedule` | OK | « Planification » (`web-09-schedule.png`) |
| RC-271 | `/dashboard` | OK | « Tableaux de bord » (`web-10-dashboard.png`) |
| RC-273 | `/campaigns` | OK (rendu) | « Notifications push » (`web-11-campaigns.png`) ; envoi non testé |
| RC-274 | `/help-center` | OK | « Centre d'aide », 6 questions · 6 publiées, langues FR/EN/ES/PT par question, aperçu téléphone FR/EN/ES/PT identique à `GET /help/faq` (`web-12-help-center.png`) |
| RC-275 | Boîte support | NT | onglet absent en EDITOR (attendu) ; compte SUPPORT de recette à créer |
| RC-272 | `/help` | OK | « Aide — guide du back-office » (`web-13-help.png`) |
| RC-218 / 276 | `/account` | OK (partiel) | « Mon compte » avec la liste des appareils de confiance (`web-14-account.png`) ; pas d'indicateur « cet appareil » |
| — | Erreurs console / API | OK | **0** erreur console, 0 `pageerror`, 0 réponse API ≥ 400 sur les 14 pages |

## 7. Données de test et nettoyage

Créées : invités `qa-jalon1-api-*`, `qa-jalon1-ratelimit-*` (sans données, pas d'API de suppression) ; comptes e-mail
`qa-jalon1-121012@qa.drama.local` et `qa-jalon1-121058@qa.drama.local` et compte téléphone `+22890000077` → **`DELETE /me`
202** (anonymisation le 29/11) ; appareil push factice `qa-jalon1-fake-fcm-token-0001` supprimé (204) ; demande de
support « QA-Jalon1 test 121058 » (statut `OPEN`, à fermer par un compte SUPPORT : pas d'API utilisateur pour la
supprimer) ; un appareil de confiance « Navigateur » supplémentaire sur `editor@drama.local` (révocable depuis
`/account`). Aucune série, bannière ou rangée créée (pas d'upload cette campagne). Émulateurs : langue de l'app,
`font_scale` et services d'accessibilité remis à leur valeur initiale à chaque passe ; E36 réinitialisé (`pm clear`).
Téléphone : aucune action. Instance backend QA `:3001` arrêtée et worktree `qa-head` supprimé en fin de campagne.

## 8. Non testé et pourquoi

- **Téléphone TECNO CM6** : hors USB de 12:01 à 14:59 ; à 15:00 l'agent Android y menait une lecture (partage, progression) et le téléphone a de nouveau disparu à 15:05. Restent à faire sur appareil réel : 4G réelle (RC-051), sous-titres automatiques en français (RC-080), parcours compte complet (RC-111 à 124), liens profonds (RC-044, RC-325), TalkBack (RC-331), ±10 s au doigt (RC-071).
- **Émulateur entrée de gamme E29** : deux pertes par OOM de l'hôte (14:26, puis chien de garde) ; à partir de 15:01 l'AVD `QA_LowEnd_API29` a été utilisé en même temps par l'agent Android (installation d'un autre build à 15:01:46, captures concurrentes) : seules les mesures antérieures (création de l'invité, démarrages à froid, PSS accueil, jeton push) sont retenues.
- **E36** : parcours compte (inscription, déconnexion), persistance de la langue après redémarrage, TalkBack, flux multi-éléments, URL signée, hors-ligne en lecture : émulateur perdu trois fois (12:18, 12:27, 14:34) sous une charge hôte de 60 à 160 ; la saisie clavier par `adb input text` sur le formulaire d'inscription a été tronquée.
- **API** : DEF-001 et DEF-004 non retestables sans upload (pas de série de recette créée cette fois pour ne pas alourdir une base partagée) ; expiration réelle des URL signées (`plain`).
- **Back-office** : étape TOTP et déconnexion dans le navigateur (une seule connexion autorisée par campagne) ; boîte de réception du support et comptes / audit (rôle SUPPORT ou ADMIN de recette toujours absent) ; envoi de campagne.
- **8 appareils dont 3 d'entrée de gamme** : 2 émulateurs exploités, 1 téléphone non exploité ; appareils 4 à 8 de la matrice toujours à acquérir.

## 9. Actions proposées

1. Réserver le téléphone CM6 et l'AVD `QA_LowEnd_API29` à la QA sur un créneau dédié (sans compilation ni autre agent), et rejouer RC-051, RC-080, RC-111 à 124, RC-331 sur le CM6 en données mobiles.
2. Mesurer le démarrage à froid du **build `benchmark` (R8 + profil de base)** sur E29 et sur un téléphone 2 Go réel ; le debug dépasse la cible.
3. Créer les comptes de recette `qa-admin@drama.local` (ADMIN) et `qa-support@drama.local` (SUPPORT) pour couvrir B-13 et la boîte support, et fermer la demande « QA-Jalon1 test 121058 ».
4. Corriger DEF-011 (double `PUT /me/devices/push`) et DEF-012 (puces de genre) avec les défauts mineurs déjà planifiés (DEF-002 à 009) ; refermer DEF-001 au prochain upload de recette.
5. Pour les prochaines campagnes, isoler les scratchpads et AVD par agent (collision de scripts et d'APK constatée dans le répertoire partagé).
