# android/ — agent notes

Kotlin + Jetpack Compose + Media3 + Hilt, multi-module, Gradle Kotlin DSL. JDK 17 is mandatory (`JAVA_HOME`),
Android SDK path goes in the gitignored `android/local.properties`. Run everything through `./gradlew`.

## Modules and dependency direction

```
app ──► feature:* ──► core:ui, core:common, domain
 │                        (never another feature, never :data)
 ├────► data ──► domain, core:network, core:database, core:common
 └────► core:* (wiring only)
domain ──► core:common          (pure Kotlin/JVM, no Android, no DI annotations)
core:common                     (pure Kotlin/JVM)
```

- `:domain` and `:core:common` are JVM-only (`drama.jvm.library`) and are the future Kotlin Multiplatform
  candidates. Never add Android or Hilt imports there; use cases are plain classes wired in `:data/di/UseCaseModule`.
- `:data` implements the domain repositories (Retrofit DTO mapping, Room, DataStore). The only place that knows
  both the network and the database.
- `:feature:*` = one user-facing area: `navigation/` (type-safe `@Serializable` route + `NavGraphBuilder.xxxScreen()`),
  a `@HiltViewModel`, a stateful `XxxScreen` wrapper and a stateless `XxxContent`. Features expose only their
  navigation functions to `:app`.
- `:core:ui` = theme, tokens, shared composables. `:core:network` = Retrofit/OkHttp/kotlinx.serialization,
  `BuildConfig.API_BASE_URL`, auth interceptor. `:core:database` = Room entities/DAOs + DataStore.
- `:feature:player/engine` is the only module that touches Media3 ExoPlayer; the view model talks to the
  `PlaybackEngine` interface so it stays JVM-testable.

## Build conventions

- Versions live in `gradle/libs.versions.toml`; module build files apply the convention plugins from `build-logic/`
  (`drama.android.application|library|compose|feature`, `drama.hilt`, `drama.jvm.library`). Add dependencies
  through catalog aliases only.
- AGP 9 built-in Kotlin: never apply `org.jetbrains.kotlin.android`; Kotlin jvmTarget follows `compileOptions`.
- Annotation processing is KSP only (no kapt). Hilt modules live next to what they provide (`di/` package).
- ktlint (`ktlint_official` + Composable naming exception) runs on `./gradlew ktlintCheck`; fix with `ktlintFormat`.
- Unit tests sit in `src/test` (JUnit4, coroutines-test, Turbine, MockK). Instrumented tests in `src/androidTest`.
- Strings shown to users are French; code, identifiers, log tags and comments are English.
- The server is the source of truth for balances, prices and entitlements: no monetisation logic on the client.
