# DRAMA — application Android

Application de micro-séries verticales (Kotlin, Jetpack Compose, Media3, Hilt). Ce dossier contient le socle
multi-module du Sprint 1 (S01-A1-01, S01-A1-02), le spike lecteur HLS (S01-A2-01, S01-A2-02), les fondations du
Sprint 2 : couche réseau sur l'API réelle (S02-A1-01), compte invité (S02-A1-02), Room progression/historique/cache
(S02-A1-03), Firebase conditionnel (S02-A1-04) et contrôles du lecteur (S02-A2-03), puis le Sprint 3 : accueil et
fiche série réels (S03-A1-01), sous-titres (S03-A2-01), vitesse et qualité (S03-A2-02), AAB signé et distribution
interne (S03-OPS-01).

## Prérequis

| Outil | Version | Remarque |
| --- | --- | --- |
| JDK | **17** (Temurin recommandé) | AGP 9 refuse de tourner sous JDK 11. Le projet n'embarque aucun chemin de JDK. |
| Android SDK | plateformes 35/36, build-tools 36 | Chemin déclaré dans `android/local.properties` (fichier ignoré par git). |
| Android Studio | version alignée sur AGP 9.5 (canal stable récent) | Facultatif : tout se fait aussi en ligne de commande. |
| Gradle | wrapper fourni (`./gradlew`) | Ne pas installer Gradle. |

### Installer et déclarer le JDK 17

```bash
mkdir -p ~/.jdks && cd ~/.jdks
curl -L -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
mkdir jdk17 && tar -xzf jdk17.tar.gz -C jdk17 --strip-components=1 && rm jdk17.tar.gz
```

Puis, pour chaque session de terminal (ou dans `~/.bashrc`) :

```bash
export JAVA_HOME="$HOME/.jdks/jdk17"
export PATH="$JAVA_HOME/bin:$PATH"
```

Alternative sans variable d'environnement : ajouter `org.gradle.java.home=/home/<vous>/.jdks/jdk17` dans
`~/.gradle/gradle.properties` (fichier utilisateur, jamais dans le dépôt).

### Déclarer le SDK Android

Créer `android/local.properties` (ignoré par git) :

```properties
sdk.dir=/home/<vous>/Android/Sdk
```

## Commandes

```bash
cd android
./gradlew :app:assembleDebug          # APK de debug : app/build/outputs/apk/debug/app-debug.apk
./gradlew test                        # tests unitaires de tous les modules
./gradlew ktlintCheck                 # style Kotlin (ktlintFormat pour corriger)
./gradlew lintDebug                   # Android Lint
./gradlew installDebug                # installe sur l'appareil/émulateur connecté
./gradlew :app:bundleRelease          # AAB release (R8 + shrink) : app/build/outputs/bundle/release/app-release.aab
```

La CI (`.github/workflows/android-ci.yml`) exécute `ktlintCheck`, `lintDebug`, `test` puis `:app:assembleDebug` à
chaque push, et le job `bundle` (AAB release, signature, Firebase App Distribution) sur les tags `v*`
(voir « Release : signature, R8 et distribution interne »).

## Carte des modules

| Module | Type | Rôle |
| --- | --- | --- |
| `:app` | application | `@HiltAndroidApp`, activité unique, `NavHost` + barre de navigation (Accueil, Pour vous, Ma liste, Profil), thème M3, edge-to-edge, liaisons Hilt des abstractions `core:common` (`AndroidDeviceLocale` pour `Accept-Language` / `X-Country`). |
| `:core:common` | Kotlin/JVM pur | `AppResult`/`AppError`, `DispatcherProvider`, façade `Logger`, `AnalyticsEvent`, `ShareLinkProvider` (liens de partage), `AuthConfig` (identifiant Google). |
| `:core:ui` | bibliothèque Compose | `DramaTheme` (Material 3, thème sombre provisoire), jetons (`DramaColors`, `DramaSpacing`, `DramaSizes`), composants partagés (`PosterCard`, `PosterImage` Coil, `SkeletonBox`, `OfflineBanner`, `ErrorState`), `UiText` et les chaînes partagées en FR/EN/ES/PT. |
| `:core:network` | bibliothèque | Retrofit (`AuthApi`, `AccountAuthApi`, `UserApi`, `CatalogApi`, `PlaybackApi`) + OkHttp + kotlinx.serialization, DTO de l'OpenAPI v1.2 (contrat `docs/api/public-contract-v1.2.md`), `ApiErrorMapper`, `SessionManager` (+ `adopt` pour le rattachement), `AuthInterceptor`, `TokenAuthenticator`, `RetryInterceptor`, `LocaleHeadersInterceptor`, client `@LinkClient` (porteur sans authenticator pour `/auth/*`). |
| `:core:database` | bibliothèque | Room v4 (`watch_progress`, `watch_history`, cache catalogue, `home_banners`, `favorites`, `series.likes/liked`), DataStore `user_preferences` (vitesse, qualité, sous-titres, recherches récentes) et `session` (jetons chiffrés par le Keystore). |
| `:core:player` | bibliothèque | Moteur Media3 partagé par le lecteur et le flux : `PlaybackEngine` / `ExoPlaybackEngine` (pool de lecteurs, préchargement, cache), `TrackSelectionMapper`. Seul module qui touche ExoPlayer. |
| `:domain` | Kotlin/JVM pur | Modèles `Series`, `Episode`, `PlaySession`, `FeedItem`, `SearchResult`, `UserProfile`, `LikeState`, `SignedUrlPolicy` (marge de 30 s, un seul réessai sur 403), `HomeContent`, `PlayerSettings`, `ResumeTarget`, `WatchProgress`, `SessionState`, interfaces de dépôts (`FeedRepository`, `SearchRepository`, `FavoritesRepository`, `AccountRepository`, ...) et cas d'usage. |
| `:data` | bibliothèque | `RemoteCatalogRepository` (API + cache Room, stale-while-revalidate), `RemotePlaybackRepository`, `RemoteFeedRepository`, `RemoteSearchRepository`, `RoomFavoritesRepository` (optimiste avec retour arrière), `DefaultAccountRepository` (connexion, rattachement, profil), `DefaultSessionRepository`, dépôts Room, `FakeCatalogRepository` (tests et bascule debug). |
| `:feature:home` | feature | Accueil M-01 : carrousel de bannières, rangées configurées (Tendances, Nouveautés, genres, manuelles), « Continuer à regarder », pull-to-refresh, squelette, bandeau hors-ligne. |
| `:feature:player` | feature | Lecteur vertical plein écran, résolution `POST /episodes/{id}/play` par page, progression toutes les 5 s, contrôles (M-13 : vitesse, qualité), sous-titres (M-14), page « verrouillé », mesure de démarrage. |
| `:feature:series` | feature | Fiche série M-10 : affiche, synopsis dépliable, genres, âge, grille des épisodes (gratuit / débloqué / verrouillé), « Regarder » / « Reprendre l'épisode N », cœur « Ma liste », « J'aime » avec compteur, partage, liens profonds `drama://series/{id}` et `https://<hôte>/s/{id}`. |
| `:feature:feed` | feature | Flux « Pour vous » M-02 : `VerticalPager` plein écran sur `GET /feed`, extraits signés en lecture automatique (muet, un appui pour le son), cœur, « Regarder la série », pagination par curseur. |
| `:feature:search` | feature | Recherche M-03 : suggestions (`GET /search/suggest`, anti-rebond 300 ms), résultats (`GET /search`), puces de genre, recherches récentes (10 max, effaçables). |
| `:feature:mylist` | feature | Ma liste M-16 : `GET /me/favorites`, pull-to-refresh, retrait d'une série. |
| `:feature:account` | feature | Profil M-50/M-51/M-52 : connexion Google (Credential Manager), téléphone + OTP, e-mail ; rattachement du compte invité ; carte de profil, modification du nom, déconnexion, suppression ; **Paramètres** (`SettingsViewModel`) : langue appliquée immédiatement, préférences de notification, entrées Aide et Mes notifications. |
| `:feature:help` | feature | Centre d'aide M-53 : FAQ (`GET /help/faq?lang`) par catégorie avec recherche, formulaire « Nous contacter » (`POST /help/contact`), « Mes demandes » (`GET /help/tickets`), état hors ligne. |
| `:feature:notifications` | feature | Historique in-app M-54 (`GET /me/notifications`), marquage lu, routage vers la série / l'épisode / l'aide. |
| `:benchmark` | test (macrobenchmark) | `BaselineProfileGenerator` et `StartupBenchmark` contre le type de build `benchmark` de `:app` (S06-A2-02). |
| `build-logic/` | plugins de convention | `drama.android.application|library|compose|feature`, `drama.hilt`, `drama.jvm.library`. |

Sens des dépendances : `app → feature:* → core:ui / core:common / domain` ; `app → data → domain / core:*`.
`:domain` et `:core:common` n'ont aucune dépendance Android : ce sont les candidats à l'extraction Kotlin Multiplatform.

## Versions principales

AGP 9.5.0 · Kotlin 2.4.21 · KSP 2.3.12 · Gradle 9.8.2 · Compose BOM 2026.06.01 (Compose UI 1.11.4, Material 3 1.4.0) ·
Media3 1.11.1 · Hilt 2.60.1 · Room 2.8.5 · Navigation Compose 2.9.8 · Lifecycle 2.10.0 · Retrofit 3.0.0 · OkHttp 5.4.0 ·
kotlinx.serialization 1.12.0 · Coil 3.5.0. `compileSdk`/`targetSdk` 36, `minSdk` 26.

> **Pourquoi pas les toutes dernières versions ?** Les publications AndroidX/OkHttp/Coil postérieures à l'été 2026
> (Compose BOM 2026.08+, core 1.19, lifecycle 2.11, navigation 2.10, hilt-navigation-compose 1.4, OkHttp 5.5, Coil 3.6)
> exigent `compileSdk 37`. Le socle reste volontairement sur 36 (SDK installé, cible du Sprint 1). Pour les adopter :
> installer `platforms;android-37.2`, passer `compileSdk = "37"` dans `gradle/libs.versions.toml` et remonter ces versions.

## Backend local et configuration réseau

L'app consomme directement le backend NestJS (`cd backend && npm run dev`, port 3000). Les adresses sont des
`BuildConfig` du module `:core:network`, surchargeables par propriétés Gradle :

| Propriété | Défaut (debug) | Rôle |
| --- | --- | --- |
| `dramaApiBaseUrl` | `http://10.0.2.2:3000/` | Base de l'API (émulateur → machine hôte). |
| `dramaMediaBaseUrl` | `http://10.0.2.2:9000/drama-media` | Base des médias MinIO. En debug, les URL `localhost`/`127.0.0.1` renvoyées par le backend (`CDN_BASE_URL`) sont réécrites vers cette origine (`MediaUrlResolver`). Jamais en release. |
| `dramaUseFakeCatalog` | `false` | `true` : catalogue factice du Sprint 1 (`FakeCatalogRepository` + `FakePlaybackRepository`), aucun backend requis. |

Téléphone sur le même Wi-Fi :

```bash
./gradlew :app:assembleDebug -PdramaApiBaseUrl=http://<IP-du-PC>:3000/ -PdramaMediaBaseUrl=http://<IP-du-PC>:9000/drama-media
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Session invitée (S02-A1-02)

- Au premier lancement, `AppStartup` appelle `POST /auth/guest` avec un **UUID d'installation** généré par l'app et
  conservé dans DataStore (`session`), jamais un identifiant matériel.
- Les jetons sont chiffrés avant écriture (`AndroidKeystoreTokenCipher`, AES-256-GCM, clé dans l'Android Keystore).
  Choix retenu plutôt que `security-crypto` (déprécié) ou Tink (dépendance lourde) : ~60 lignes, aucune dépendance.
  Si la clé est invalidée par le système, les jetons deviennent illisibles et l'app recrée silencieusement un invité.
- `AuthInterceptor` ajoute `Authorization: Bearer` (et crée l'invité si besoin) ; `TokenAuthenticator` rafraîchit sur
  401 en **vol unique** (`SessionManager.recoverFrom401`, mutex) et rejoue la requête une seule fois. Un refresh
  rejeté (`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`, `REFRESH_TOKEN_EXPIRED`) efface la session et recrée un
  invité : sans rattachement de compte (M-50, sprint 5) il n'existe pas d'autre chemin de retour.
- `SessionRepository.state` expose `SessionState` (`Unknown`, `Connecting`, `Authenticated`, `SignedOut`) ;
  `logout()` efface jetons, progression, historique et cache catalogue.
- Logcat : `adb logcat -s Session AppStartup` (`guest session created user=…`, `tokens rotated`).

### Couche réseau (S02-A1-01)

- Délais OkHttp : connexion 10 s, lecture/écriture 20 s, appel 45 s. `RetryInterceptor` rejoue les **GET** en échec
  réseau (`IOException`) deux fois avec repli exponentiel (500 ms, 1 s) ; jamais les POST/PUT.
- Journal HTTP (`HttpLoggingInterceptor`, niveau BASIC, en-tête `Authorization` masqué, tag Logcat `Http`) en debug
  uniquement.
- Erreurs : le corps `ApiErrorDto` est converti en `AppError` typé — `Unauthenticated` (401), `Locked` (403
  `EPISODE_LOCKED`, avec `coinCost`), `NotFound` (404), `Server` (5xx), `Http` (autres), `Network`.

### Room (S02-A1-03)

Schéma v4 (export dans `core/database/schemas/`, migrations automatiques 1 → 2 → 3 → 4 ; la v4 ajoute `favorites`
et `series.likes` / `series.liked`) :
`watch_progress` (+ `completed`), `watch_history` (dernier épisode vu par série), cache catalogue (`series`,
`episodes`, `home_rows`, `home_row_items`, `cache_meta`). Politique **stale-while-revalidate** : cache servi
immédiatement s'il existe, rafraîchi en arrière-plan quand il a plus de 5 min (accueil) ou 10 min (série,
épisodes), valeur périmée conservée en cas d'échec réseau (`Resource.Error(data = cache)`).
Test de migration instrumenté : `./gradlew :core:database:connectedDebugAndroidTest`.

### Firebase Crashlytics et Analytics (S02-A1-04)

Le build n'exige pas Firebase. Pour l'activer :

1. Dans la console Firebase, créer une app Android `com.drama.app` **et** une app `com.drama.app.debug`
   (suffixe du build debug) dans le même projet.
2. Télécharger `google-services.json` et le déposer dans `android/app/` (fichier ignoré par git, ne jamais le
   committer). Aucune autre modification : `app/build.gradle.kts` applique les plugins Google services et Crashlytics
   uniquement si le fichier existe et positionne `BuildConfig.FIREBASE_CONFIGURED`.
3. Rebuild : au démarrage, Logcat affiche `Analytics: Firebase ready (project=…), Crashlytics enabled` ; sans le
   fichier, les événements sont tracés dans Logcat (`adb logcat -s Analytics`).

Événements émis (spec §13) : `app_open`, `series_view` (`series_id`, `source`), `episode_start` (`series_id`,
`episode_id`, `episode_number`, `resumed`), `episode_complete`, `paywall_view` (épisode verrouillé).
L'identifiant utilisateur Firebase est l'id serveur du compte invité.

### En-têtes de langue et de pays (addendum v1.1)

`LocaleHeadersInterceptor` ajoute à chaque appel `Accept-Language` (locale de l'appareil, ex. `fr-FR, fr;q=0.9`)
et `X-Country` (pays de la SIM, sinon du réseau, sinon de la locale). Le backend s'en sert pour filtrer les
rangées de l'accueil par pays et traduire leurs titres. Logcat `Http` (niveau BASIC) n'affiche pas les en-têtes ;
pour vérifier : `adb logcat -s Http` montre les URL, le backend journalise le pays reçu.

### Vérification de bout en bout

```bash
adb logcat -s AppStartup Session Http Catalog Player PlayerSpike Analytics
# AppStartup: guest session ready user=…            ← POST /auth/guest
# Http: --> GET …/home  /  <-- 200 …/home            ← accueil chargé
# PlayerSpike: source set index=0 uri=…master.m3u8  ← POST /episodes/{id}/play
# Player: progress sent episode=… position_ms=…     ← PUT /progress toutes les 5 s, en pause, à la sortie
# PlayerSpike: start index=0 … start_ms=12000       ← reprise à la position serveur après relance de l'app
```

## Accueil et fiche série (S03-A1-01)

- **Accueil** (`GET /home`) : bannières configurées dans le back-office (`{id, seriesId, imageUrl, title, subtitle}`,
  carrousel auto toutes les 5 s, points de page, appui → fiche série) puis rangées actives typées
  `TRENDING | NEW | GENRE | MANUAL | CONTINUE_WATCHING`. L'app accepte aussi l'ancienne forme (bannières = résumés de
  série, rangées sans `type`, type déduit de la clé) tant que le backend n'a pas livré la mise en avant.
- **Continuer à regarder** : fusion de l'historique local (Room, immédiat) et de la rangée serveur
  (synchronisée entre appareils), dédoublonnée par série, entrées terminées exclues ; la carte porte la barre de
  progression et l'appui ouvre le lecteur à l'épisode (reprise serveur). Sans rangée serveur, elle est placée en
  tête. Les rangées vides sont masquées.
- Cartes 2:3 (`PosterCard`, Coil : espace réservé + fondu 250 ms), squelette au premier chargement, bandeau
  « Hors ligne : contenu en cache » quand le rafraîchissement échoue, pull-to-refresh (`PullToRefreshBox`).
- **Barre de navigation** : Accueil · Pour vous (espace réservé, M-02 au sprint 4) · Ma liste (espace réservé,
  M-16) · Profil (coquille compte). La fiche série et le lecteur s'affichent plein écran, sans barre.
- **Fiche série** (`GET /series/{id}` + `GET /series/{id}/episodes`, stale-while-revalidate) : affiche verticale
  avec dégradé, titre, âge, nombre d'épisodes, gratuits, genres, synopsis dépliable, bouton « Regarder » ou
  « Reprendre l'épisode N » (`ResumeTarget` : dernier épisode vu non terminé, sinon le suivant, sinon le premier),
  grille d'épisodes 5 colonnes avec statut (« Gratuit », « Débloqué », cadenas + coût). Appui sur un épisode →
  lecteur ; un épisode verrouillé affiche la page « verrouillé » du lecteur (paywall au sprint 7).
- Événement `series_view` (`series_id`, `source` = `home` | `deeplink`) à l'ouverture de la fiche.
- **Lien profond** : `drama://series/{seriesId}` (manifeste + `navDeepLink`). Test :
  `adb shell am start -a android.intent.action.VIEW -d "drama://series/<uuid>" com.drama.app.debug`.
  Le domaine HTTPS (App Links) sera ajouté quand l'hôte de production sera connu.

## Lecteur (S01-A2-01 / S01-A2-02 / S02-A2-03 / S03-A2-01 / S03-A2-02)

### Sous-titres (S03-A2-01, M-14)

- Les pistes viennent de `POST /episodes/{id}/play` (`subtitles: [{language, label, url}]`, WebVTT) et sont attachées
  au `MediaItem` en `SubtitleConfiguration` (`text/vtt`), jamais marquées « par défaut » : la sélection passe par
  `TrackSelectionParameters.setPreferredTextLanguage` (+ piste texte désactivée quand « Désactivés »).
- Préférence persistée (DataStore `subtitle_mode`) : `auto` (défaut = langue de l'appareil si l'épisode la propose,
  sinon rien), `off`, ou un code ISO 639-1. Résolution par épisode dans `TrackSelectionMapper.resolveSubtitleLanguage`.
- Rendu : `SubtitleView` (media3-ui) piloté par `Player.Listener.onCues`, style `CaptionStyleCompat` lisible sur
  vidéo (blanc gras, fond noir translucide, ombre portée, 18 sp), au-dessus de la barre de progression.
- Sélecteur : puce `CC FR` / `CC Off` en haut à droite ou menu ⚙ → « Sous-titres » (Désactivés + langues de
  l'épisode). Logcat `PlayerSpike` : `tracks … text=[fr] selected_text=fr`.

### Vitesse et qualité (S03-A2-02, M-13)

- Vitesse 0,75× / 1× / 1,25× / 1,5× / 2× (`setPlaybackSpeed`), persistée (`playback_speed`).
- Qualité Auto / 1080p / 720p / 540p / 360p : le « p » désigne le **petit côté** de l'image (renditions verticales
  360×640 … 1080×1920). Le plafond passé à `setMaxVideoSize` est le grand côté d'un cadre 16:9 à cette qualité
  (360p → 640 px), ce qui borne de la même façon portrait et paysage (`TrackSelectionMapper.longSideCap`).
  Les options proposées suivent les renditions réellement présentes dans le manifeste HLS (`onTracksChanged`).
  Persistée (`max_video_height`, 0 = auto).
- Les valeurs courantes sont affichées dans la barre du haut (`1.5x` · `360p` ou `Auto · 540p` quand la rendition
  en cours est connue · `CC FR`) et survivent aux changements d'épisode (réappliquées à chaque `play()` du pool).
- Vérification Logcat : `adb logcat -s PlayerSpike Player` →
  `settings applied speed=1.5 max_short_side=360 subtitles=fr` puis
  `selected video format index=0 360x640 bitrate=… cap_short_side=360`.


### Contrôles (S02-A2-03)

Appui = pause/reprise · double appui gauche/droite = −10 s / +10 s · glisser la barre de progression = recherche
(libellés `m:ss / m:ss`, position cible pendant le glissement) · bouton « Son/Muet » · fin d'épisode : overlay
« Épisode suivant ▶ » avec compte à rebours de 3 s (ou « Revoir » sur le dernier épisode). Un épisode `locked`
(403 `EPISODE_LOCKED`) affiche la page « Épisode verrouillé — paywall au sprint 7 » au lieu de lire.

### Stratégie

- **`VerticalPager`** avec une page par épisode ; balayage vers le haut = épisode suivant ; appui = pause/reprise ;
  barre de progression en bas ; écran maintenu allumé pendant la lecture ; barres système masquées ; portrait forcé.
- **Préchargement : `DefaultPreloadManager` (Media3 1.11)**, pas de second lecteur « préparé mais en pause ».
  Le gestionnaire possède une `MediaSource` par épisode et cible : épisode suivant/précédent → 5 s de média chargées
  (`PreloadStatus.specifiedRangeLoaded(5000)`), ±2 → pistes sélectionnées, le reste → rien.
- **Un lecteur par page visible, pool de deux** : les `ExoPlayer` sont construits par
  `DefaultPreloadManager.Builder.buildExoPlayer()` (même looper de lecture, même `LoadControl`, même mesure de bande
  passante). La page visible possède un lecteur ; à chaque changement de page le lecteur sortant est arrêté et remis
  dans le pool, le lecteur entrant reçoit `preloadManager.getMediaSource(item)`. Jamais plus de deux instances vivantes :
  pas d'écran noir pendant l'animation du pager, mémoire bornée (cible appareils 2 Go).
- **Cache** : `CacheDataSource.Factory` sur un `SimpleCache` LRU de 256 Mo (`cacheDir/media`), partagé par le
  préchargement et la lecture ; les segments déjà téléchargés ne sont jamais re-téléchargés.
- `DefaultLoadControl` resserré : 10–30 s de tampon, 500 ms avant démarrage, 1,5 s après re-tamponnage.

Code : `feature/player/src/main/kotlin/com/drama/feature/player/engine/ExoPlaybackEngine.kt`.

### Lire la mesure de démarrage

Le temps de démarrage est mesuré entre l'appel `setMediaSource()`+`prepare()` et le rappel
`Player.Listener.onRenderedFirstFrame()` (horloge `SystemClock.elapsedRealtime()`).

1. **Overlay** : en haut à gauche du lecteur, en vert monospace :
   `1re image : 412 ms (préchargé) · READY 388 ms`, la liste des épisodes déjà préchargés, l'état, puis l'historique
   des démarrages de la session.
2. **Logcat**, tag `PlayerSpike` :

   ```bash
   adb logcat -s PlayerSpike
   # PlayerSpike: playlist set: 3 items, cache-backed data source
   # PlayerSpike: start index=0 preloaded=false uri=https://...m3u8
   # PlayerSpike: first_frame index=0 startup_ms=1180 ready_ms=1102 preloaded=false
   # PlayerSpike: preload completed index=1
   # PlayerSpike: start index=1 preloaded=true uri=https://...
   # PlayerSpike: first_frame index=1 startup_ms=210 ready_ms=160 preloaded=true
   ```

   `startup_ms` est la valeur à reporter dans le rapport de spike ; `preloaded=true` indique que l'épisode a bénéficié
   du préchargement. Pour la mesure « 4G réelle » (critère d'acceptation), lancer l'app sur un téléphone en données
   mobiles, ouvrir « Lire la série de test », balayer les trois épisodes et relever les trois lignes `first_frame`.
   Pour la consommation mémoire d'entrée de gamme : `adb shell dumpsys meminfo com.drama.app.debug` pendant la lecture.

### Mesures préliminaires (émulateur, à titre indicatif)

Relevé du 28/10/2026 sur l'AVD `Medium_Phone_API_36.1` (x86_64, GPU logiciel SwiftShader, réseau de la machine hôte),
APK de debug, `PlayerSpike` dans Logcat :

| Épisode | Flux | Préchargé | 1re image (`startup_ms`) | `READY` |
| --- | --- | --- | --- | --- |
| 1 (démarrage à froid, cache vide) | Mux Big Buck Bunny | non | 1 674 ms (machine chargée par la compilation) | — |
| 2 | Apple BipBop HEVC | oui | 806 ms | 879 ms |
| 3 | Mux test_001 | oui | 436 ms · 486 ms · 763 ms (trois passes) | 504 ms · 942 ms |

Mémoire pendant la lecture (`dumpsys meminfo`, debug, émulateur) : 110 à 215 Mo de PSS selon la passe.
Ces chiffres ne valent pas recette : l'émulateur décode en logiciel et son réseau est instable juste après le
démarrage (une passe a échoué en `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED`). Le critère d'acceptation
S01-A2-01 (« démarrage mesuré en 4G réelle ») se relève sur un téléphone d'entrée de gamme en données mobiles,
avec la procédure ci-dessus.

### Vidéos de test verticales

Le catalogue de dev (seed du backend) et le catalogue factice (`-PdramaUseFakeCatalog=true`) pointent sur les trois
épisodes 9:16 (1080x1920, HLS multi-débits) produits par `infra/media-samples/generate.sh` et servis par le MinIO
de dev (voir `infra/README.md`), à l'adresse `BuildConfig.MEDIA_BASE_URL` (voir la table ci-dessus).

Le build debug autorise le HTTP en clair (`app/src/debug/res/xml/network_security_config.xml`) ; le build
release ne l'autorise pas. Le lecteur affiche l'image entière (`ContentScale.Fit`), jamais rognée : sur un écran 20:9 un contenu 9:16
laisse de fines bandes noires où se posent les commandes, comme TikTok ; la barre d'état reste visible.

## Sprint 4 : flux, lecture signée, partage, recherche, Ma liste et compte

### Flux « Pour vous » (S04-A1-01, M-02)

`FeedViewModel` pagine `GET /feed` par curseur (page suivante demandée dès qu'il reste moins de deux éléments après
la page courante) et lit chaque `previewUrl` signée dans le moteur partagé `:core:player` (même pool, même cache et
même préchargement que le lecteur : la page courante et ses voisines ont une source attachée). Les extraits démarrent
muets, un appui active le son pour la session, la lecture s'arrête quand l'onglet est caché ou l'application en
arrière-plan. `series_view{source=feed}` est émis à chaque page stabilisée, `favorite{source=feed}` sur le cœur.

### Lecture par URL signée (S04-A2-01)

`SignedUrlPolicy` (`:domain`) porte la règle : une URL (`expiresAt` de `/play`, `previewExpiresAt` du flux) est
re-demandée 30 s avant son expiration (minuteur sur la page courante, vérification avant d'attacher une voisine) et
une seule fois après un HTTP 403 du serveur de médias, avec reprise à la même position ; un second 403 fait remonter
l'erreur. Le lecteur et le flux appliquent la même politique (`PlayerViewModel`, `FeedViewModel`).

### Partage et App Links (S04-A1-03, M-16)

Le bouton « Partager » (fiche série, lecteur) ouvre la feuille de partage système avec
`https://<APP_LINKS_HOST>/s/{seriesId}` ; le schéma `drama://series/{seriesId}` reste déclaré en repli. L'hôte vient de
la propriété Gradle `-PdramaAppLinksHost=` (défaut `links.drama.example`, variable `APP_LINKS_HOST` en CI) et alimente
`BuildConfig.APP_LINKS_HOST` et l'`intent-filter` `android:autoVerify="true"` du manifeste. Événement `share{source}`.

Pour que les liens ouvrent l'application sans boîte de dialogue, publier sur l'hôte le fichier
`https://<hôte>/.well-known/assetlinks.json` (type `application/json`, HTTPS, sans redirection) :

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.drama.app",
    "sha256_cert_fingerprints": ["<EMPREINTE_SHA256_DE_LA_CLÉ_DE_SIGNATURE>"]
  }
}]
```

Empreinte SHA-256 de la clé (une entrée par clé : debug, release, et la clé Play App Signing lue dans la Play Console) :

```bash
# clé debug
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256
# clé release (variables DRAMA_KEYSTORE_*)
keytool -list -v -keystore "$DRAMA_KEYSTORE_PATH" -alias "$DRAMA_KEY_ALIAS" | grep SHA256
```

Vérifier sur l'appareil : `adb shell pm verify-app-links --re-verify com.drama.app` puis
`adb shell pm get-app-links com.drama.app` (état `verified`), et
`adb shell am start -a android.intent.action.VIEW -d "https://<hôte>/s/<seriesId>"`.

### Recherche (S05-A1-01, M-03) et Ma liste (S05-A1-02, M-16)

La loupe de l'accueil ouvre `SearchScreen` : la saisie est anti-rebondie (300 ms) vers `GET /search/suggest`,
la validation (ou une suggestion, une recherche récente, une puce de genre) appelle `GET /search?q&genre` ; les
recherches récentes (10 max, dédoublonnées, effaçables une à une ou toutes) sont dans le DataStore `user_preferences`.
« Ma liste » lit `GET /me/favorites` dans Room (`favorites`), avec pull-to-refresh et retrait ; cœur sur la fiche
série et dans le flux, « J'aime » sur la fiche (`POST`/`DELETE /series/{id}/like`). Les deux bascules sont optimistes
avec retour arrière en cas d'échec (`RoomFavoritesRepository`).

### Connexion et rattachement (S05-A2-01, S05-A2-02, M-50/M-51)

L'onglet Profil montre à un invité trois options :

- **Google** : Credential Manager + `GetGoogleIdOption` avec l'identifiant OAuth « Web application »
  (`BuildConfig.GOOGLE_WEB_CLIENT_ID`), lu dans l'ordre depuis `-PdramaGoogleWebClientId=`, `drama.googleWebClientId`
  dans `android/local.properties` (ignoré par git) ou la variable `DRAMA_GOOGLE_WEB_CLIENT_ID` (secret CI
  `GOOGLE_WEB_CLIENT_ID`). Vide → bouton désactivé « non configuré ». Le backend vérifie l'`idToken`
  (`GOOGLE_CLIENT_IDS`) ; un client OAuth « Android » portant le nom de paquet et la SHA-1 de la clé est aussi requis
  côté Google Cloud pour que la boîte de dialogue propose les comptes.
- **Téléphone** : sélecteur d'indicatif (Afrique de l'Ouest d'abord), `POST /auth/otp/request`, code à 6 chiffres
  vérifié automatiquement, « Renvoyer le code » après `resendAfter` secondes. En dev (`SMS_PROVIDER=console`) le code
  est dans les logs de l'API et dans Redis (`otp:<requestId>`).
- **E-mail** : création ou connexion, mot de passe de 8 caractères minimum.

Chaque appel part avec le porteur invité (client `@LinkClient`, sans rotation de jeton sur 401) ; la réponse
`AuthSession` remplace la session en place (`SessionManager.adopt`, jetons toujours chiffrés) : historique,
progression et favoris locaux sont conservés, et `linked=true` affiche « Compte rattaché, votre historique est
conservé ». Un compte connecté voit sa carte de profil, peut modifier nom et langue (`PATCH /me`), se déconnecter
(`POST /auth/logout` puis nouvelle session invitée) ou supprimer son compte (`DELETE /me`, confirmation, suppression
différée de 30 jours). Événements `login{provider, linked}` / `signup{provider, linked}`.

## Sprint 5 : paramètres, langues, aide, notifications push, accessibilité et performance

### Paramètres et langue (S05-A1-03, M-52)

Profil → « Langue · Notifications » ouvre l'écran Paramètres (invité ou compte) :

- **Langue** (Français, English, Español, Português) : appliquée immédiatement à toute l'application par les
  locales par application (`AppCompatDelegate.setApplicationLocales`, `MainActivity` est une `AppCompatActivity`,
  `android:localeConfig` + `autoStoreLocales` : le choix survit au redémarrage et apparaît aussi dans
  Réglages Android → Langues de l'application sur Android 13+), puis envoyée au serveur (`PATCH /me {language}`).
  `Accept-Language` suit la langue choisie (`AndroidDeviceLocale` lit d'abord la locale de l'app) et le cache
  catalogue est vidé pour recharger les rangées traduites. Hors ligne, la langue reste appliquée localement.
- **Notifications** : trois interrupteurs (Nouveaux épisodes, Offres, Rappel quotidien) → `PATCH /me
  {notificationPreferences}`, optimistes avec retour arrière. Quand les notifications sont coupées côté système,
  l'écran le dit et propose « Autoriser les notifications » (demande `POST_NOTIFICATIONS` sur Android 13+) ou
  l'ouverture des réglages du téléphone.
- Économiseur de données (M-17) : interrupteur prévu, masqué (`SettingsUiState.showDataSaver = false`).

### Internationalisation (S05-A2-03)

- Chaque module de fonctionnalité et `:core:ui` portent leurs chaînes dans `res/values/strings.xml` (français,
  source) et `values-en`, `values-es`, `values-pt` (mêmes clés ; Lint `MissingTranslation` est bloquant).
  Clés préfixées par module (`home_`, `series_`, `player_`, `account_`, `settings_`, `help_`, `notifications_`),
  vocabulaire commun dans `core/ui` (`action_*`, `state_*`, `error_*`, pluriels `episode_count`, `coin_count`).
- Les view models n'émettent jamais de texte brut : `UiText` (`Res`, `Plural`, `Raw` pour un message serveur),
  résolu dans les composables (`asString()`), ce qui garde les tests JVM lisibles (`UiText.Res(R.string.x)`).
- Dates relatives via `DateUtils.getRelativeTimeSpanString`, nombres via `String.format(Locale.getDefault())`,
  noms de pays via `java.util.Locale` : tout suit la langue de l'app.
- Le bundle n'a plus de split par langue (les quatre tables tiennent en quelques dizaines de Ko) pour que le
  sélecteur in-app fonctionne sans téléchargement différé.

### Centre d'aide (S06-A1-01, M-53)

Profil → « Aide » : trois onglets. **FAQ** (`GET /help/faq?lang=<langue de l'app>`, repli fr côté serveur) groupée
par catégorie, réponses dépliables, recherche locale insensible aux accents ; **Nous contacter** (catégorie parmi
compte / pièces / VIP / paiement / lecture / contenu / autre, sujet, message, e-mail facultatif →
`POST /help/contact`, confirmation avec le numéro de demande, limite serveur de 5 par jour affichée comme
« trop de demandes ») ; **Mes demandes** (`GET /help/tickets`, statut ouvert / répondu / fermé, fil des messages).
Hors ligne : état avec « Réessayer » ; backend sans l'endpoint (404/501) : état vide « bientôt disponible ».

### Notifications push (S06-A1-02, M-54)

- **Jeton FCM** : `PUT /me/devices/push {token, platform, locale, appVersion}` à chaque changement d'utilisateur
  (démarrage invité, connexion, déconnexion → nouvel invité) et à chaque `onNewToken`, une seule fois par couple
  (jeton, utilisateur) (`DefaultPushRepository`, mémorisé dans DataStore) ; `DELETE /me/devices/push/{token}` juste
  avant la déconnexion ou la suppression du compte, tant que le porteur de l'utilisateur sortant est valide.
  Logcat : `adb logcat -s Push AppStartup` → `push token registered user=… token=…`.
- **Canaux** : Nouveaux épisodes, Offres, Rappels, Support (créés au démarrage, noms localisés).
- **Permission** `POST_NOTIFICATIONS` (Android 13+) : demandée après le premier ajout à Ma liste (fiche série) ou
  depuis l'écran Paramètres, jamais au lancement ; un seul rappel (`PushRepository.permissionPromptShown`).
- **Réception** : `DramaMessagingService`. App visible → snackbar avec action « Voir » ; sinon notification sur le
  canal du `type` (`new_episode`, `offer`/`campaign`, `checkin_reminder`, `support_reply`). Les notifications
  affichées par FCM lui-même (bloc `notification` + app en arrière-plan) sont aussi routées au tap grâce aux
  extras `type` / `notificationId` / `seriesId` / `episodeId`.
- **Routage** (`NotificationRouting`, :domain) : `deepLink` explicite, sinon `seriesId`+`episodeId` → lecteur
  (`drama://player/{seriesId}/{episodeId}`), `seriesId` → fiche (`drama://series/{id}`), `support_reply` → aide
  (`drama://help`), offres / rappels → `drama://notifications`. Au tap : `push_open` (Firebase + `POST /events`) et
  `POST /me/notifications/{id}/read`.
- **Mes notifications** : Profil → « Mes notifications » (`GET /me/notifications`, pagination, non lues en gras,
  rafraîchi à chaque push reçu).
- Test manuel avec le fournisseur `log` du backend : déclencher une campagne ou publier un épisode d'une série en
  favori, puis ouvrir Profil → Mes notifications (l'historique in-app est alimenté même sans FCM) ; avec
  `PUSH_PROVIDER=fcm` la notification arrive sur l'appareil.

### Accessibilité (S06-A1-03) — audit

| Critère | État |
| --- | --- |
| Libellés lecteur d'écran | Toutes les icônes et boutons ont un `contentDescription` (null uniquement pour les icônes décoratives à côté d'un texte) ; les lignes cliquables fusionnent leurs descendants (`mergeDescendants`) avec un `Role` ; cartes d'affiche annoncées « titre, sous-titre, progression » ; cellules d'épisode « Épisode N, gratuit / débloqué / verrouillé, N pièces ». |
| Ordre TalkBack | Accueil : titre (heading) → recherche → bandeau hors ligne → bannières → rangées. Fiche série : retour / partager / Ma liste → titre → métadonnées → bouton principal → J'aime → synopsis → grille. Lecteur : barre du haut (retour, épisode, vitesse, qualité, sous-titres, partager, réglages) → surface vidéo (état lecture/pause, actions personnalisées lecture/pause, +10 s, −10 s) → titre → son → barre de progression (`progressBarRangeInfo`, `setProgress`). |
| Cibles tactiles ≥ 48 dp | `DramaSizes.touchTarget` sur boutons, puces, lignes de réglage, cœur, retrait de Ma liste, puces du lecteur. |
| Taille de police 200 % | Conteneurs de texte en `heightIn(min)` et `FlowRow`, pas de hauteur fixe ; vérifié sur accueil, fiche série et compte (Réglages → Taille de police au maximum, `adb shell settings put system font_scale 2.0`). |
| Contrastes | Texte principal `#F7F7FA` sur `#09090C` ≈ 18:1 ; secondaire `#9A9AA8` ≈ 7,3:1 ; accent `#FF3B6B` sur noir ≈ 5,1:1 (≥ 4,5:1, utilisé pour les libellés d'action) ; or `#F2B33D` ≈ 10:1 ; vert `#3DD68C` ≈ 10:1. Aucun ajustement nécessaire. |
| Interrupteurs et radios | Lignes entières `toggleable` / `selectable` avec `Role.Switch` / `Role.RadioButton` (un seul nœud, état annoncé). |
| Lecteur annoncé | Chips « Vitesse de lecture : 1,5x », « Qualité : Auto », « Sous-titres : désactivés » ; fin d'épisode en `liveRegion`. |

### Performance (S06-A2-01/02/03)

Type de build `benchmark` sur `:app` (bytecode release + R8, clé de debug, URLs de dev, HTTP en clair autorisé,
`profileable`) ; `:benchmark` (macrobenchmark) exécute `BaselineProfileGenerator` (profil de démarrage + baseline,
copié dans `app/src/main/baseline-prof.txt` et compilé par `profileinstaller`) et `StartupBenchmark`.

```bash
# profil : généré sur l'émulateur API 36 (user build ≥ 33 accepté), copié dans app/src/main/baseline-prof.txt
./gradlew :app:assembleBenchmark
./gradlew :benchmark:connectedBenchmarkAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.drama.benchmark.BaselineProfileGenerator
cp benchmark/build/outputs/connected_android_test_additional_output/benchmark/connected/*/BaselineProfileGenerator_generate-baseline-prof.txt app/src/main/baseline-prof.txt
# démarrage à froid (émulateur entrée de gamme API 29, 2 Go, 2 cœurs, 320 dpi, GPU logiciel)
adb shell am force-stop com.drama.app && adb shell am start -W -n com.drama.app/com.drama.app.MainActivity
# taille de téléchargement
java -jar bundletool.jar build-apks --bundle=app/build/outputs/bundle/release/app-release.aab --output=app.apks
java -jar bundletool.jar get-size total --apks=app.apks --dimensions=ABI,SCREEN_DENSITY
```

Première image vidéo : le moteur force la rendition la plus basse jusqu'à la première image rendue
(`setForceLowestBitrate(true)` sur le lecteur et sur le gestionnaire de préchargement), puis rend la main à l'ABR
(Logcat `PlayerSpike` : `settings applied … startup_lowest=true` puis `startup_lowest=false` après `first_frame`).

#### Relevé du 30/10/2026 (AVD `LowEnd_API29` : Android 10, 2 Go de RAM, 2 cœurs, 320 dpi, GPU logiciel SwiftShader, machine chargée par la compilation ; `am start -W`, médiane de 5 démarrages à froid)

| Mesure | Cible | Avant | Après | Commentaire |
| --- | --- | --- | --- | --- |
| Démarrage à froid, build `benchmark` (R8) | < 2 500 ms | 606 ms (568–656) | 569 ms (552–616) | « Après » = APK avec `baseline-prof.txt` (1 125 règles `com.drama`, 16 k au total) compilé `speed-profile` par `profileinstaller` |
| Démarrage à froid, build `debug` | — | 699 ms (630–730) | — | Indicatif : le debug n'a pas de profil |
| Première image vidéo (`PlayerSpike first_frame`, cache vide, backend local) | < 1 500 ms | 1 180 ms (sprint 1, émulateur API 36, ABR libre) | 231 ms (rendition 360p forcée, puis 540p à 0,6 s et 720p à 12 s) | `startup_lowest=true` jusqu'à la première image, puis ABR normal |
| Taille de téléchargement AAB (bundletool `get-size total`, par ABI × densité) | < 30 Mo | 3,88 Mo max (sprint 4) | **3,88 Mo max, 3,83 Mo min** | AAB release R8 + shrink : 10,5 Mo ; les quatre tables de chaînes ajoutent ~40 Ko |

Les chiffres émulateur sont indicatifs (x86_64 virtualisé, décodage logiciel) ; la recette S06-A2 se relève sur le
TECNO CM6 et un appareil 2 Go réel avec la même procédure (`scratchpad/android-s5/coldstart.sh` dans le compte rendu).


## Release : signature, R8 et distribution interne (S03-OPS-01)

### Signature

La configuration `release` lit quatre clés, d'abord dans l'environnement puis dans `android/local.properties`
(fichier ignoré par git) :

```properties
DRAMA_KEYSTORE_PATH=/chemin/vers/drama-release.jks   # absolu, ou relatif à android/
DRAMA_KEYSTORE_PASSWORD=…
DRAMA_KEY_ALIAS=drama
DRAMA_KEY_PASSWORD=…
```

Si l'une manque (ou si le fichier n'existe pas), `release` est signée avec la **clé de debug** : `./gradlew
:app:bundleRelease` fonctionne toujours en local (le log Gradle l'indique : « release falls back to the debug key »),
mais un tel AAB n'est pas distribuable. Créer la clé de production (à conserver hors dépôt, sauvegardée) :

```bash
keytool -genkeypair -v -keystore drama-release.jks -alias drama -keyalg RSA -keysize 4096 -validity 10000
```

### R8

`isMinifyEnabled` + `isShrinkResources` sur `release`, règles dans `app/proguard-rules.pro` (kotlinx.serialization :
DTO et routes de navigation ; Retrofit : fonctions `suspend`). Retrofit, OkHttp, Room, Hilt, Media3, Coil et Firebase
embarquent leurs propres règles. Le `mapping.txt` est dans `app/build/outputs/mapping/release/` (téléversé en CI,
90 jours) ; `LineNumberTable` est conservé pour Crashlytics.

### CI : job `bundle` sur les tags `v*`

`git tag v0.3.0 && git push origin v0.3.0` déclenche, après le job de build : `:app:bundleRelease` avec
`versionName = 0.3.0` et `versionCode = numéro de run`, puis l'AAB et le mapping en artefacts. Secrets GitHub :

| Secret | Rôle |
| --- | --- |
| `DRAMA_KEYSTORE_BASE64` | keystore en base64 (`base64 -w0 drama-release.jks`) |
| `DRAMA_KEYSTORE_PASSWORD`, `DRAMA_KEY_ALIAS`, `DRAMA_KEY_PASSWORD` | identifiants de la clé |
| `GOOGLE_SERVICES_JSON` | contenu de `google-services.json` ; l'`appId` Firebase de `com.drama.app` en est extrait |
| `FIREBASE_APP_DISTRIBUTION_SA` | compte de service Firebase (rôle « Firebase App Distribution Admin ») |

Sans secrets de signature : AAB signé debug, artefact suffixé `-debugsigned`, pas de distribution. Avec la clé mais
sans compte de service : AAB signé, pas de distribution. Avec les deux : envoi à Firebase App Distribution, groupe
`internal-testers` (à créer dans la console Firebase, testeurs invités par e-mail).

## Qualité

- `ktlint` (`ktlint_official`, exception de nommage pour les `@Composable`) via `./gradlew ktlintCheck` / `ktlintFormat`.
- Tests unitaires : `:core:common` (AppResult), `:domain` (navigation d'épisodes, cas d'usage, politique de reprise),
  `:core:network` (`TokenAuthenticatorTest` avec MockWebServer : refresh en vol unique, rotation, repli invité ;
  `ApiErrorMapperTest` ; `RetryInterceptorTest`), `:data` (`RemoteCatalogRepositoryTest` : politique de cache,
  bannières et types de rangées ; `MediaUrlResolverTest`), `:feature:home` (`HomeViewModelTest` : rangées, fusion
  « Continuer à regarder », états), `:feature:series` (`SeriesViewModelTest` : cible de reprise, `series_view`,
  états), `:feature:player` (`PlayerViewModelTest` : /play, verrouillé, seek, ±10 s, muet, fin d'épisode,
  progression 5 s, persistance vitesse / qualité / sous-titres, survie au changement d'épisode, URL signée
  re-demandée 30 s avant expiration, un seul réessai sur 403), `:core:player` (`TrackSelectionMapperTest`),
  `:domain` (`SignedUrlPolicyTest`), `:feature:feed` (`FeedViewModelTest` : lecture auto muette, pagination par
  curseur, extrait expiré, rafraîchissement 30 s avant expiration, 403, onglet caché, cœur optimiste),
  `:feature:search` (`SearchViewModelTest` : anti-rebond, suggestions, genres, récents plafonnés à 10),
  `:data` (`RoomFavoritesRepositoryTest` : bascules optimistes et retours arrière sur MockWebServer ;
  `DefaultAccountRepositoryTest` : connexion, rattachement, déconnexion), `:feature:account`
  (`AccountViewModelTest` : OTP, minuteur de renvoi, e-mail, message de rattachement, déconnexion).
- Android Lint : `./gradlew lintDebug` (bloquant sur les erreurs).
