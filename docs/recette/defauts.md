# Liste des défauts — recette DRAMA

Mise à jour : 31 octobre 2026, campagne n° 3b téléphone (`campagne-2026-10-31-phone.md`) ; créée lors de la
campagne n° 1. Gravités : **bloquant** (empêche un parcours P1, pas de
contournement), **majeur** (fonction P1 incorrecte ou contournement pénible), **mineur** (écart sans impact sur le
parcours). Statut : ouvert / corrigé (commit) / fermé (revérifié).

| ID | Gravité | Lot présumé | Titre | Statut |
| --- | --- | --- | --- | --- |
| DEF-001 | majeur | BE (`catalog.where.ts`, `admin-series.service.ts`) + WEB B-02 | Épisode READY invisible dans l'app après publication de la série tant que `publishedAt` n'est pas saisi | corrigé (35f0339) — non retestable sans upload le 30/10 (campagne 2) : correctif présent dans HEAD, couvert par les e2e backend ; à refermer au prochain upload de recette |
| DEF-002 | mineur | BE S05-BE-06 (M-03) | `GET /search` refuse une recherche par genre seul (`q` obligatoire) | **fermé** (revérifié le 31/10, campagne 3 : `GET /search?genre=romance` → 200, 1 résultat) |
| DEF-003 | mineur | BE S04-BE-02 (`PUT /progress`) | Progression acceptée sur un épisode verrouillé | **fermé** (revérifié le 31/10, campagne 3 : `PUT /progress` sur l'ép. 3 verrouillé → 403 `EPISODE_LOCKED`) |
| DEF-004 | mineur | BE S04-BE-02 (`POST /play`) | Restriction de territoire non appliquée à la lecture | **fermé** (revérifié le 31/10, campagne 3, sur une série QA dédiée `territories:["AQ"]` : `/play` avec `X-Country: TG` → 404 `EPISODE_NOT_FOUND`, avec `X-Country: AQ` → 200) |
| DEF-005 | mineur | WEB S03-WEB-02 | Étape TOTP : code incomplet soumis et message générique « (400) » | corrigé le 30/10 (commit 271b8a3) — **non rejoué en campagne 3** (recette API/Android cette fois, pas de session navigateur back-office ; reste à revérifier à l'écran) |
| DEF-006 | mineur | A1 S02-A1-02 | Session invitée remplacée silencieusement après un refresh refusé | ouvert (non reproduit en campagne 2 : installations fraîches) |
| DEF-007 | mineur | A2 S05-A2-03 / A1 S03-A1-01 | Accueil mélangeant français (interface) et anglais (titres des rangées) sur un appareil `en-US` | **fermé** (983275b ; revérifié le 30/10 sur E36 `en-US` : interface et rangées en anglais, `e36-01-home.png`) |
| DEF-008 | mineur | BE S04-BE-03 / S04-BE-01 | Paramètres non validés : `cursor` du flux et `X-Country` acceptés quelle que soit leur valeur | **fermé** (revérifié le 31/10, campagne 3 : `GET /feed?cursor=garbage` → 400 `VALIDATION_ERROR` ; `GET /home` avec `X-Country: ZZZZ` → 400 `VALIDATION_ERROR`) |
| DEF-009 | mineur | BE S05-BE-05 | Code d'erreur incohérent sur un identifiant de favori mal formé (`BAD_REQUEST` au lieu de `VALIDATION_ERROR`) | **fermé** (revérifié le 31/10, campagne 3 : `PUT /me/favorites/abc` → 400 `VALIDATION_ERROR`) |
| DEF-010 | information | BE / docs | `docs/api/openapi.v1.json` (1.2.0, 66 routes) en retard sur l'API en cours (1.3.0, 89 routes) | **fermé** (fichier committé en 1.3.0 / 89 routes = `/docs-json` servi le 30/10 12:00) |
| DEF-011 | mineur | A1 S06-A1-02 (`DefaultPushRepository`) | Jeton push enregistré deux fois au démarrage (`PUT /me/devices/push` ×2 en 12 ms) | **fermé** (revérifié le 31/10, campagne 3b téléphone : 3 relances sans doublon au Logcat, une seule ligne en base `push_devices`, mutex de dédoublonnage confirmé par le code) |
| DEF-012 | mineur | A2 S05-A2-03 / S05-BE-06 | Puces de genre de l'écran de recherche en français (« Drame », « Comédie », « Famille ») sur une interface en anglais ou en espagnol | **fermé** (revérifié le 31/10, campagne 3b téléphone : puces Recherche « Romance, Drama, Comedy, Action » en anglais ; voir DEF-013/DEF-014 pour deux lacunes i18n apparentées trouvées pendant ce retest) |
| DEF-013 | mineur | A1 (Accueil / `RemoteGenresRepository`) | Après un changement de langue en session, l'Accueil garde les libellés de genre dans l'ancienne langue jusqu'à ce qu'un autre écran rafraîchisse le cache | **fermé** (corrigé le 31/10, commit f61e370 : `HomeViewModel.onLanguageChanged` rafraîchit désormais `GenresRepository`, vérifié sur le téléphone) |
| DEF-014 | mineur | A2 (`FeedScreen.kt`, flux « Pour vous ») | Le flux « Pour vous » n'utilise jamais le dictionnaire de traduction des genres (capitalisation brute de la valeur serveur) | **fermé** (corrigé le 31/10, commit f61e370 : `FeedViewModel`/`FeedScreen` branchés sur `GenresRepository` comme les autres écrans) |

---

## DEF-001 — Épisode READY invisible dans l'app après publication de la série

> **Corrigé le 30 octobre 2026** (commit 35f0339) : un épisode prêt reçoit sa date de publication à la fin du transcodage, et la publication d'une série date ses épisodes prêts sans date ; les épisodes programmés gardent leur date.

- **Gravité** : majeur. **Lot présumé** : backend (`src/catalog/catalog.where.ts` : `visibleEpisodeWhere` =
  `publishedAt <= now AND transcodeStatus = READY` ; `POST /admin/series/{id}/publish` fixe `publishedAt` de la
  série mais jamais celui des épisodes ; `/uploaded` et le passage en READY ne le fixent pas non plus) et
  back-office B-02 (aucun avertissement, colonne « Publication » vide).
- **Étapes** : 1. En EDITOR, créer la série `QA-Recette`, ajouter un épisode, uploader, attendre `READY`.
  2. Publier la série (200, statut PUBLISHED). 3. `GET /series/{id}` et `GET /series/{id}/episodes` côté public.
  4. `POST /episodes/{id}/play`.
- **Attendu** : la série publiée expose son épisode prêt (`episodeCount = 1`, grille avec « Gratuit »), lecture
  possible. C'est le parcours nominal de B-01/B-02 (« publier une série complète sans intervention technique »).
- **Constaté** : `episodeCount = 0`, grille `[]`, `/play` → 404 `EPISODE_NOT_FOUND`. Après
  `PATCH /admin/episodes/{id} {"publishedAt": <passé>}` : grille remplie, `/play` 200. Les épisodes du seed
  portent une date, ce qui masque le problème en dev.
- **Preuves** : rapport §5 RC-176 et §6 RC-233 ; réponses API du 30/10 07:30:09 (404) puis 07:30:10 (200) ;
  `web-17-qa-series-episodes.png` (après correction manuelle de la date).
- **Impact** : un éditeur qui suit le guide publie une série vide dans l'application. Contournement : saisir une
  date par épisode ou utiliser « Planifier une sortie quotidienne ».

## DEF-002 — Recherche par genre seul impossible côté API

> **Fermé le 31 octobre 2026** (campagne 3) : `GET /search?genre=romance` renvoie 200 avec « Le Secret du Lagon ».

- **Gravité** : mineur (majeur si les puces de genre de l'app envoient `genre` sans `q`, à vérifier sur appareil).
  **Lot** : backend S05-BE-06 (DTO de `GET /search`).
- **Étapes** : `GET /search?genre=romance`.
- **Attendu** (contrat v1.2 `GET /search?q&genre` et M-03 « recherche par titre, genre, mot-clé ») : liste des
  séries du genre.
- **Constaté le 30/10** : 400 `VALIDATION_ERROR` « q must be longer than or equal to 2 characters ».
- **Constaté le 31/10 (campagne 3)** : 200, `{"items":[{"title":"Le Secret du Lagon",...}],"total":1,...}`.
- **Preuve** : rapport §5 RC-173 (30/10) ; `evidence/campagne3/api-def-002-003-004-008-009.txt` (31/10).

## DEF-003 — `PUT /progress` accepté sur un épisode verrouillé

> **Fermé le 31 octobre 2026** (campagne 3) : `PUT /progress` sur l'épisode verrouillé renvoie 403 `EPISODE_LOCKED`.

- **Gravité** : mineur. **Lot** : backend S04-BE-02 / S03-A2-03.
- **Étapes** : invité sans déblocage ; `PUT /progress {"episodeId": <ép. 3 verrouillé>, "positionSeconds": 5}`.
- **Attendu** : refus (403 `EPISODE_LOCKED` ou 404), le serveur faisant foi sur les droits (§8.4) ; une
  progression sur un épisode non lisible fausserait « Continuer à regarder » et les statistiques B-11.
- **Constaté le 30/10** : 200 `{"positionSeconds":5,"completed":false}`.
- **Constaté le 31/10 (campagne 3)** : 403 `{"code":"EPISODE_LOCKED","message":"This episode must be unlocked
  first",...}`.
- **Preuve** : rapport §5 RC-179 (30/10) ; `evidence/campagne3/api-def-002-003-004-008-009.txt` (31/10).

## DEF-004 — Restriction de territoire non appliquée à `POST /play`

> **Fermé le 31 octobre 2026** (campagne 3) : testé sur une série QA dédiée (`territories:["AQ"]`), `/play` avec
> `X-Country: TG` → 404 `EPISODE_NOT_FOUND`, avec `X-Country: AQ` → 200.

- **Gravité** : mineur (B-12 territoires est P2 ; `X-Country` est fourni par le client). **Lot** : backend
  `playback.service.ts` (`publishedSeriesWhere({})` sans pays).
- **Étapes** : série limitée à `AQ` ; `GET /series/{id}` avec `X-Country: TG` → 404 ; `POST /episodes/{id}/play`
  avec `X-Country: TG`.
- **Attendu** : même règle que le catalogue (404 ou 403).
- **Constaté le 30/10** : 200 avec `manifestUrl`.
- **Constaté le 31/10 (campagne 3)** : série QA jetable `QA-Territoire Campagne3` (`territories:["AQ"]`, 1 épisode
  READY) créée pour le test, archivée ensuite (nettoyage) ; `X-Country: TG` → 404 `EPISODE_NOT_FOUND` ;
  `X-Country: AQ` → 200 avec `manifestUrl`.
- **Preuve** : rapport §5 RC-182 (30/10) ; `evidence/campagne3/api-def-002-003-004-008-009.txt` (31/10).

## DEF-005 — Étape TOTP : code incomplet soumis, message générique

- **Gravité** : mineur. **Lot** : web S03-WEB-02 (`pages/login.vue`).
- **Étapes** : 1. Mot de passe correct. 2. Saisir un seul chiffre dans les cases du code. 3. « Vérifier ».
- **Attendu** : bouton inactif tant que 6 chiffres ne sont pas saisis ; en cas de code faux, message
  « Code incorrect » (le backend renvoie 401 `INVALID_TOTP_CODE` pour un code faux et 400 `VALIDATION_ERROR` pour
  un code incomplet).
- **Constaté** : `POST /admin/auth/totp/verify` 400 et bandeau « Une erreur est survenue (400). ». Même famille :
  un mot de passe de moins de 8 caractères à l'étape 1 renvoie 400 (validation) et non « Identifiants incorrects ».
- **Preuve** : `web-13-login-wrong-totp.png` ; rapport §6 RC-213 ; API RC-215 / T3.

## DEF-006 — Session invitée remplacée silencieusement après un refresh refusé

- **Gravité** : mineur (comportement documenté dans `android/README.md`, mais sans retour utilisateur ni journal
  du code d'erreur). **Lot** : Android A1 S02-A1-02 (`SessionManager.recoverFrom401`).
- **Étapes** : E36 avec une session créée lors d'une installation antérieure ; ouvrir le lecteur une fois le JWT
  d'accès expiré.
- **Attendu** : rafraîchissement réussi, ou, s'il est refusé, information de l'utilisateur et journalisation du
  code (`INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_REUSED` / `REFRESH_TOKEN_EXPIRED`) pour diagnostic.
- **Constaté** (Logcat E36, 30/10 07:26:16) : `POST /auth/refresh` → 401 puis `POST /auth/guest` → 201 ; l'onglet
  Profil affiche ensuite « Identifiant invité : 01a18bb3… » alors que `AppStartup` indiquait `01a18816…` ; la
  progression serveur de l'ancien invité est orpheline ; l'historique local reste affiché. Cause probable en dev :
  jetons issus d'une base réinitialisée par un autre agent.
- **Preuve** : rapport §4 RC-004.

## DEF-007 — Accueil mélangeant français et anglais sur un appareil `en-US`

- **Gravité** : mineur. **Lot** : Android A2 S05-A2-03 (i18n en cours) ; A1 S03-A1-01.
- **Étapes** : émulateur en `en-US`, ouvrir l'accueil.
- **Attendu** : interface et titres des rangées dans la même langue.
- **Constaté** : interface en français (« Continuer à regarder », « Accueil », « Ma liste ») et rangées serveur
  en anglais (« Trending », « New releases ») car `Accept-Language: en-US` est envoyé par l'app.
- **Preuve** : `api36-01-home.png`, `api29-01-home.png`. À refermer avec la livraison de S05-A2-03.

## DEF-008 — Paramètres non validés (`cursor`, `X-Country`)

> **Fermé le 31 octobre 2026** (campagne 3) : les deux cas renvoient désormais 400 `VALIDATION_ERROR`.

- **Gravité** : mineur. **Lot** : backend S04-BE-03 / S04-BE-01.
- **Étapes** : `GET /feed?cursor=garbage` ; `GET /home` avec `X-Country: ZZZZ`.
- **Attendu** : 400 pour un curseur illisible ; en-tête pays hors ISO 3166-1 alpha-2 ignoré ou refusé de façon
  explicite.
- **Constaté le 30/10** : 200 première page ; 200 sans filtre (clé de cache `cache:v1:home:ZZZZ:*` potentiellement
  créée par valeur arbitraire).
- **Constaté le 31/10 (campagne 3)** : `GET /feed?cursor=garbage` → 400 `{"code":"VALIDATION_ERROR",
  "details":{"errors":["cursor is not a valid feed cursor"]}}` ; `GET /home` avec `X-Country: ZZZZ` → 400
  `{"code":"VALIDATION_ERROR","details":{"errors":["X-Country must be an ISO 3166-1 alpha-2 country code"]}}`.
- **Preuve** : rapport §5 RC-170, RC-181 (30/10) ; `evidence/campagne3/api-def-002-003-004-008-009.txt` (31/10).

## DEF-009 — Code d'erreur incohérent sur un identifiant de favori mal formé

> **Fermé le 31 octobre 2026** (campagne 3) : `PUT /me/favorites/abc` renvoie désormais `VALIDATION_ERROR`.

- **Gravité** : mineur. **Lot** : backend S05-BE-05 (`ParseUUIDPipe` non aligné sur le filtre `ApiErrorDto`).
- **Étapes** : `PUT /me/favorites/abc`.
- **Attendu** : 400 `VALIDATION_ERROR` comme les autres erreurs de validation.
- **Constaté le 30/10** : 400 `{"code":"BAD_REQUEST","message":"Validation failed (uuid is expected)"}`.
- **Constaté le 31/10 (campagne 3)** : 400 `{"code":"VALIDATION_ERROR","details":{"errors":["id must be a
  UUID"]}}`.
- **Preuve** : rapport §5 RC-192 (30/10) ; `evidence/campagne3/api-def-002-003-004-008-009.txt` (31/10).

## DEF-010 — Document OpenAPI committé en retard sur l'API

- **Gravité** : information. **Lot** : backend / docs.
- **Constaté** : `/docs-json` sert 1.3.0 avec 89 routes (push, FAQ, support, campagnes, appareils de confiance,
  `/events`) ; `docs/api/openapi.v1.json` est en 1.2.0 avec 66 routes. Attendu tant que le sprint 5 n'est pas
  committé ; la CI (`openapi:export`) doit le rattraper au commit.


## DEF-011 — Jeton push enregistré deux fois au démarrage

> **Fermé le 31 octobre 2026** (campagne 3b téléphone) : 3 cycles force-stop/relance sur le téléphone réel du
> client sans la moindre ligne `push token registered` en double au Logcat, une seule ligne en base
> `push_devices` pour l'utilisateur testé, et revue du code confirmant que `AppStartup` et
> `DramaMessagingService.onNewToken` passent tous deux par un `Mutex` unique avec comparaison `(token, userId)`
> avant d'émettre le `PUT`.

- **Gravité** : mineur (deux écritures idempotentes, pas d'effet visible). **Lot** : Android A1 S06-A1-02
  (`DefaultPushRepository`, synchronisation du jeton par couple (jeton, utilisateur) ; `android/README.md` annonce
  « une seule fois par couple »).
- **Étapes** : installation fraîche (`pm clear`), lancer l'app, `adb logcat -s Http AppStartup`.
- **Attendu** : un seul `PUT /me/devices/push` pour l'invité créé.
- **Constaté le 30/10 (campagne 2, E36)** : `PUT /me/devices/push` → 204 à 12:12:18.579 puis à nouveau à
  12:12:18.591 (deux appels à 12 ms d'intervalle), `push token in sync` entre les deux : course entre le démarrage
  de session et `onNewToken`, ou double collecte du flux utilisateur.
- **Constaté le 31/10 (campagne 3, NT)** : émulateur indisponible (machine en limite de mémoire), aucun retest
  possible.
- **Constaté le 31/10 (campagne 3b, téléphone réel)** : 3 relances (`am force-stop` + relance), une seule ligne
  `AppStartup: push token in sync for user=...` par démarrage, aucune ligne `Push: push token registered` en
  double (le couple token/utilisateur était déjà en cache, donc aucun appel réseau nécessaire — comportement
  attendu du correctif). En base : `select count(*), min(created_at), max(updated_at) from push_devices where
  user_id = '01a18905-...'` → **1 ligne**, `created_at`/`updated_at` distants de 59 ms. Le code de
  `DefaultPushRepository.register()` confirme le `Mutex` partagé entre les deux appelants.
- **Limite du retest** : le jeton FCM de l'appareil étant stable depuis plusieurs jours, le scénario exact de la
  course (deux appelants simultanés au tout premier lancement) n'a pas pu être rejoué à l'identique sans une
  installation fraîche, hors de question sur le compte réel du client (tentative de suppression ciblée du fichier
  de préférences locales bloquée par le classificateur de sécurité de l'environnement comme action irréversible ;
  non contournée).
- **Preuve** : rapport campagne 2 §4 RC-320 (Logcat) ; `campagne-2026-10-31-phone.md` §2 ;
  `evidence/campagne3-phone/`.

## DEF-012 — Puces de genre non traduites sur l'écran de recherche

> **Fermé le 31 octobre 2026** (campagne 3b téléphone) : puces de l'écran Recherche « Romance, Drama, Comedy,
> Action » en anglais après passage de l'interface en English ; badge genre de la fiche série également traduit
> (« Drama · Thriller »). Deux lacunes i18n apparentées, hors périmètre du repro original, ont été trouvées
> pendant ce retest et sont suivies séparément : DEF-013 (Accueil, fraîcheur du cache) et DEF-014 (flux « Pour
> vous », jamais traduit).

- **Gravité** : mineur (cosmétique, M-03 / i18n). **Lot** : Android A2 S05-A2-03 (origine des libellés à
  confirmer : liste locale ou clés de genre du serveur).
- **Étapes** : appareil en `en-US` (ou langue de l'app Español), loupe de l'accueil.
- **Attendu** : puces de genre dans la langue de l'interface (« Drama », « Comedy », « Family » ; le serveur sait
  traduire les rangées de genre : « Drama » dans `GET /home` en `en`).
- **Constaté le 30/10 (jalon 1)** : puces « Romance », « Drame », « Comédie », « Thriller », « Famille » alors que
  le reste de l'écran est en anglais (« Title, genre, keyword… », « Recent searches »). Idem en espagnol.
- **Constaté le 31/10 (campagne 3, NT)** : émulateur indisponible.
- **Constaté le 31/10 (campagne 3b, téléphone réel)** : langue de l'app basculée Français → English dans
  Profil → Paramètres ; écran Recherche → puces « Romance, Drama, Comedy, Action » en anglais ; fiche série « La
  Nounou » → « Drama · Thriller » en anglais ; Classements → puces et libellés également en anglais.
- **Preuve** : `evidence/jalon1/e36-02-search-suggest.png`, `e36-06-search-history.png` (avant) ;
  `evidence/campagne3-phone/phone-07-search-en.png`, `phone-08-series-la-nounou-en.png`,
  `phone-16-rankings.png` (après).

## DEF-013 — Accueil : libellés de genre obsolètes après un changement de langue en session

> **Ouvert le 31 octobre 2026** (campagne 3b téléphone), trouvé en creusant au-delà du périmètre strict de
> DEF-012.

- **Gravité** : mineur (cosmétique, se corrige tout seul en naviguant, aucune perte de données). **Lot présumé** :
  Android A1 (`feature/home/HomeViewModel.kt`, `data/.../RemoteGenresRepository.kt`).
- **Étapes** : 1. Ouvrir l'Accueil (langue Français, comme au démarrage de l'app). 2. Aller dans
  Profil → Paramètres → Langue, choisir English (l'app recrée l'activité et bascule l'interface immédiatement).
  3. Revenir sur l'Accueil sans passer par un autre écran qui interroge le catalogue de genres.
- **Attendu** : les libellés de genre des cartes (« X ep. · <genre> ») passent en anglais comme le reste de
  l'interface.
- **Constaté** : la ligne « 2 ep. · **Drame** » reste en français sous « La Nounou » dans la rangée « Trending »
  alors que le titre de la rangée, les boutons et tout le reste de l'écran sont déjà en anglais
  (`phone-06-home-en.png`). Après une simple visite de l'écran Recherche (qui déclenche son propre appel
  `GET /genres?lang=en`), en revenant sur l'Accueil sans action supplémentaire, le libellé se corrige tout seul en
  « 2 ep. · **Drama** » (`phone-09-home-en-after-search.png`).
- **Cause probable** : `RemoteGenresRepository` (`data/src/main/kotlin/com/drama/data/repository/
  RemoteGenresRepository.kt`) met en cache les libellés de genre par langue dans un unique `MutableStateFlow`
  partagé par tous les écrans (singleton) ; rien ne déclenche un nouveau `GET /genres?lang=<nouvelle langue>`
  au moment du changement de langue — seul l'`init` d'un nouveau `ViewModel` (donc la première visite d'un écran
  après le changement) le fait. Un écran déjà en mémoire au moment du changement (comme `HomeViewModel`, dont le
  flux `genres.labels.collect` reste actif) continue donc d'afficher les libellés de l'ancienne langue jusqu'à ce
  qu'un *autre* écran déclenche la mise à jour du flux partagé.
- **Suggestion de correctif** : appeler `genres.refresh(force = true)` au moment du changement de langue
  (`AppLocaleController.setAppLanguage` / `SettingsViewModel.onLanguageSelected`), plutôt que de compter sur la
  prochaine navigation.
- **Confirmation supplémentaire (sens inverse)** : en remettant l'app en français en toute fin de campagne (sans
  revisiter entre-temps un écran qui rafraîchit le cache), la capture finale de l'Accueil montre « 2 ép. ·
  **Drama** » (resté en anglais) alors que toute l'interface (« Accueil », « Tendances », « Continuer à
  regarder », « Profil ») est déjà repassée en français (`phone-24-final-home-fr.png`). Confirme le même mécanisme
  dans les deux sens ; purement cosmétique et temporaire — se corrige dès la prochaine navigation ou au prochain
  démarrage à froid (le téléphone a été laissé dans cet état transitoire sans conséquence, l'app étant
  fonctionnellement en français partout ailleurs).
- **Preuve** : `evidence/campagne3-phone/phone-06-home-en.png` (avant), `phone-09-home-en-after-search.png`
  (après), `phone-24-final-home-fr.png` (confirmation en sens inverse).

## DEF-014 — Flux « Pour vous » : genres jamais traduits

> **Ouvert le 31 octobre 2026** (campagne 3b téléphone), trouvé en creusant au-delà du périmètre strict de
> DEF-012.

- **Gravité** : mineur (cosmétique). **Lot présumé** : Android A2 (`feature/feed/src/main/kotlin/com/drama/
  feature/feed/FeedScreen.kt`).
- **Étapes** : 1. Passer l'app en English (ou Español/Português). 2. Ouvrir l'onglet « Pour vous » (flux vertical
  plein écran, M-02).
- **Attendu** : le sous-titre de la carte (genre(s) + nombre d'épisodes) dans la langue de l'interface, comme
  l'Accueil, la Recherche et la fiche série.
- **Constaté** : carte « La Nounou » → « **Drame** · Thriller · 2 ep. » en français alors que l'interface entière
  (titre d'écran « For you », boutons « Add », « Like », « Watch the series ») est en anglais, et alors que
  l'Accueil et la Recherche affichaient déjà correctement « Drama » au même moment de la session
  (`phone-20-foryou.png`).
- **Cause confirmée par le code** : `FeedScreen.kt:369` construit le sous-titre directement à partir de
  `item.series.genres.take(2).joinToString(" · ") { it.replaceFirstChar(Char::titlecase) }` — une simple mise en
  majuscule de la valeur brute, sans jamais consulter `GenresRepository`/`GenreLabels` comme le font
  `HomeViewModel`, l'écran Recherche et la fiche série. Contrairement à DEF-013, ce n'est pas un problème de
  fraîcheur de cache : l'écran ne traduira jamais le genre, quel que soit le moment où on l'ouvre.
- **Suggestion de correctif** : injecter `GenresRepository` dans le ViewModel du flux et utiliser
  `genreLabels.label(key)` comme les autres écrans, au lieu de capitaliser la valeur brute.
- **Preuve** : `evidence/campagne3-phone/phone-20-foryou.png`.
