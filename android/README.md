# DRAMA — application Android

Application de micro-séries verticales (Kotlin, Jetpack Compose, Media3, Hilt). Ce dossier contient le socle
multi-module du Sprint 1 (S01-A1-01, S01-A1-02) et le spike lecteur HLS (S01-A2-01, S01-A2-02).

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
```

La CI (`.github/workflows/android-ci.yml`) exécute `ktlintCheck`, `lintDebug`, `test` puis `:app:assembleDebug`.

## Carte des modules

| Module | Type | Rôle |
| --- | --- | --- |
| `:app` | application | `@HiltAndroidApp`, activité unique, `NavHost`, thème M3, edge-to-edge, liaisons Hilt des abstractions `core:common`. |
| `:core:common` | Kotlin/JVM pur | `AppResult`/`AppError`, `DispatcherProvider`, façade `Logger`. |
| `:core:ui` | bibliothèque Compose | `DramaTheme` (Material 3), jetons (`DramaColors`, `DramaSpacing`), composants partagés. |
| `:core:network` | bibliothèque | Retrofit + OkHttp + kotlinx.serialization, `BuildConfig.API_BASE_URL`, `AuthInterceptor` (placeholder). |
| `:core:database` | bibliothèque | Room (`watch_progress`), DataStore (`UserPreferencesDataSource`). |
| `:domain` | Kotlin/JVM pur | Modèles `Series`, `Episode`, `PlaybackSource`, `WatchProgress`, interfaces de dépôts et cas d'usage. |
| `:data` | bibliothèque | Implémentations des dépôts. Sprint 1 : `FakeCatalogRepository` (3 épisodes HLS publics), `RoomWatchProgressRepository`. |
| `:feature:home` | feature | Écran d'accueil provisoire avec le bouton « Lire la série de test ». |
| `:feature:player` | feature | Lecteur vertical plein écran (spike), moteur Media3, overlay de mesure. |
| `:feature:series` | feature | Coquille « Fiche série » (route + écran vide). |
| `:feature:account` | feature | Coquille « Mon compte » (route + écran vide). |
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

## Spike lecteur (S01-A2-01 / S01-A2-02)

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

### Flux de test

`FakeCatalogRepository` (module `:data`) expose trois flux HLS publics : Big Buck Bunny (Mux, ABR),
Apple BipBop avancé (HEVC/fMP4 : vérifie le décodage matériel), Mux `test_001`. Ils sont remplacés par le catalogue
réel au Sprint 3.

## Vidéos de test verticales

Les flux HLS publics sont en 16:9. Le dépôt de test (`FakeCatalogRepository`) pointe donc sur les trois
épisodes 9:16 (1080x1920, HLS multi-débits) produits par `infra/media-samples/generate.sh` et servis par
le MinIO de dev (voir `infra/README.md`). L'adresse de base vient de `BuildConfig.MEDIA_BASE_URL` :

| Cible | Valeur | Comment |
| --- | --- | --- |
| Émulateur | `http://10.0.2.2:9000/drama-media` | valeur par défaut en debug |
| Téléphone sur le même Wi-Fi | `http://<IP-du-PC>:9000/drama-media` | `./gradlew :app:assembleDebug -PdramaMediaBaseUrl=http://<IP-du-PC>:9000/drama-media` |

Le build debug autorise le HTTP en clair (`app/src/debug/res/xml/network_security_config.xml`) ; le build
release ne l'autorise pas. Le lecteur remplit l'écran (`ContentScale.Crop`) : un écran 20:9 rogne
légèrement les bords d'un contenu 9:16, un contenu 16:9 serait fortement rogné, ce qui est voulu.

## Qualité

- `ktlint` (`ktlint_official`, exception de nommage pour les `@Composable`) via `./gradlew ktlintCheck` / `ktlintFormat`.
- Tests unitaires : `:core:common` (AppResult), `:domain` (navigation d'épisodes, cas d'usage), `:data`
  (dépôt factice), `:feature:player` (`PlayerViewModelTest` avec moteur de lecture factice).
- Android Lint : `./gradlew lintDebug` (bloquant sur les erreurs).
