# android/ — agent notes

Kotlin + Jetpack Compose + Media3 + Hilt, multi-module, Gradle Kotlin DSL. JDK 17 is mandatory (`JAVA_HOME`),
Android SDK path goes in the gitignored `android/local.properties`. Run everything through `./gradlew`.

## Modules and dependency direction

```
app ──► feature:* ──► core:ui, core:common, domain (+ core:player for feed and player)
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
- `:core:ui` = theme, tokens, shared composables (`Context.shareText` opens the share sheet). `:core:network` =
  Retrofit services (`AuthApi`, `AccountAuthApi`, `UserApi`, `CatalogApi`, `PlaybackApi`, `WalletApi`, `ShopApi`), DTOs mirroring
  `docs/api/openapi.v1.json` + `docs/api/public-contract-v1.2.md`, `ApiErrorMapper` (ApiErrorDto -> `AppError`),
  `SessionManager` + `AuthInterceptor` + `TokenAuthenticator` (guest session, single-flight refresh),
  `RetryInterceptor` (GET only), `BuildConfig.API_BASE_URL/MEDIA_BASE_URL/USE_FAKE_CATALOG`. Sign-in endpoints go
  through the `@LinkClient` Retrofit (bearer attached, no authenticator) so a 401 never rotates the guest tokens;
  `SessionManager.adopt` swaps the tokens in place on success (history kept, M-50).
  `:core:database` = Room (`DramaDatabase` v4, exported schemas in `core/database/schemas/`; v4 = `favorites` +
  `series.likes/liked`), DataStore (`user_preferences` incl. player settings and recent searches, `session` with
  tokens encrypted by `AndroidKeystoreTokenCipher`).
- `DeviceLocaleProvider` (:core:common) is the single source for language/country: `LocaleHeadersInterceptor`
  (`Accept-Language`, `X-Country`) and the default subtitle language read it; :app binds `AndroidDeviceLocale`.
- `:core:network` never depends on `:core:database`: it declares `SessionStore`/`DeviceIdProvider` and `:data`
  implements them over DataStore. Session tokens never leave `:core:network`/`:data`; the UI only sees `SessionState`.
- Analytics: `AnalyticsTracker`/`AnalyticsEvent` live in `:core:common`; `:app` binds Firebase when
  `app/google-services.json` was present at build time (`BuildConfig.FIREBASE_CONFIGURED`), Logcat (`tag Analytics`)
  otherwise. Add new events to `AnalyticsEvent` (spec §13 names), never call Firebase from a feature.
- Catalogue reads go through `CatalogRepository.observe*` (stale-while-revalidate over Room, `Resource<T>`) or the
  `get*` one-shots (fresh cache or network, stale fallback). Streams come only from `PlaybackRepository.startPlayback`
  (`POST /episodes/{id}/play`); `Episode` carries no manifest URL.
- `:core:player` is the only module that touches Media3 ExoPlayer (`ExoPlaybackEngine`, pool + cache + preload);
  `:feature:player` and `:feature:feed` talk to the `PlaybackEngine` interface so their view models stay JVM-testable. Playlist slots are declared first (`setPlaylist(count)`) and
  streams attached per page (`setSource`) when `/play` answers; the engine preloads whatever is already attached.
  Speed / quality cap / subtitle language are engine state re-applied on every `play()`; quality "Np" means the
  short side of the frame (`TrackSelectionMapper`). Player preferences go through `PlayerSettingsRepository`
  (:domain) and are persisted before being applied, so they survive episode changes and restarts.
- Home rows are `HomeRowType`-typed; the view model merges the local watch history into the CONTINUE_WATCHING row
  (`HomeViewModel.buildRows`). The series sheet derives its primary button from `ResumeTarget.resolve`.
- Signed URLs: `SignedUrlPolicy` (:domain) is the single rule (re-request 30 s before `expiresAt`, one re-resolve
  after an HTTP 403 then surface the error). `Long.MAX_VALUE` (`NEVER_EXPIRES`) means no timer. Both
  `PlayerViewModel` and `FeedViewModel` apply it; never hard-code margins elsewhere.
- Favorites / likes are optimistic in `RoomFavoritesRepository` (local row first, server call, rollback on failure);
  features only call `FavoritesRepository`. The feed is never cached (signed previews).
- Share links come from `ShareLinkProvider` (`https://<BuildConfig.APP_LINKS_HOST>/s/{id}`, `drama://` fallback);
  the host is the Gradle property `dramaAppLinksHost` (manifest placeholder `appLinksHost`, `autoVerify` filter).
- i18n (S05-A2-03): feature modules and `:core:ui` have Android resources enabled; every user-facing string is a
  resource (FR default in `values/`, full EN/ES/PT in `values-en|es|pt/`, same keys, Lint `MissingTranslation` is an
  error). Shared vocabulary lives in `core/ui/src/main/res` (`action_*`, `state_*`, `error_*`, plurals
  `episode_count`, `coin_count`). View models never hold French: they emit `UiText` (`:core:ui/text`), resolved with
  `asString()` in composables. Keys are prefixed by feature (`home_`, `player_`, `help_`, ...).
- Language (S05-A1-03): `AppLanguage` (:core:common) is the list of supported languages; `AppLocaleController`
  (bound in :app to `AppCompatDelegate.setApplicationLocales`, `MainActivity` is an `AppCompatActivity`,
  `localeConfig` + `autoStoreLocales` in the manifest) applies the choice immediately; `AndroidDeviceLocale` reads it
  first so `Accept-Language` follows. `SettingsViewModel` (:feature:account) applies then `PATCH /me language`, and
  `DefaultAccountRepository` clears the catalogue cache so localised rows are refetched. Language splits are off in the
  bundle (all four string tables ship).
- Push (M-54): `PushRepository` (:domain) / `DefaultPushRepository` (:data) register the FCM token with
  `PUT /me/devices/push` once per (token, user) (`AppStartup` observes the session user id; `onNewToken` forces it),
  and unregister it before logout / delete. `PushTokenProvider` + `AppInfoProvider` (:core:common) are bound in :app
  (`FirebasePushTokenProvider`). `NotificationRouting` (:domain, pure Kotlin) is the single rule for payload ->
  target -> `drama://` deep link and channel; `:app/push` holds the `FirebaseMessagingService`, channels,
  `PushNotifier` (status bar), `ForegroundPushBus` (snackbar when visible) and `PushOpenHandler` (`push_open` to
  Firebase + `POST /events`, mark read). `POST_NOTIFICATIONS` is asked after the first favourite (series) or from the
  settings, never at launch (`PushRepository.permissionPromptShown`).
- Help (M-53): `HelpRepository` (`GET /help/faq?lang`, `POST /help/contact`, `GET /help/tickets`) in :data,
  `:feature:help` screen (FAQ / contact / tickets). `NotificationsRepository` (`GET /me/notifications`,
  `POST /me/notifications/{id}/read`) feeds `:feature:notifications`. `EventsRepository` = `POST /events`.
- Performance (S06-A2): `benchmark` build type on :app (release bytecode, debug key, dev URLs, profileable) used by
  `:benchmark` (macrobenchmark, `BaselineProfileGenerator`, `StartupBenchmark`); the generated profile is committed as
  `app/src/main/baseline-prof.txt`. The engine forces the lowest rendition until the first rendered frame
  (`ExoPlaybackEngine.startupLowestBitrate`), then normal ABR.
- Google sign-in: `BuildConfig.GOOGLE_WEB_CLIENT_ID` (-PdramaGoogleWebClientId, `drama.googleWebClientId` in
  `local.properties`, env `DRAMA_GOOGLE_WEB_CLIENT_ID`); empty = `AuthConfig.isGoogleConfigured` false and the button
  is disabled. The Credential Manager call lives in `:feature:account/google`, the token is verified server-side.

## Build conventions

- Versions live in `gradle/libs.versions.toml`; module build files apply the convention plugins from `build-logic/`
  (`drama.android.application|library|compose|feature`, `drama.hilt`, `drama.jvm.library`). Add dependencies
  through catalog aliases only.
- AGP 9 built-in Kotlin: never apply `org.jetbrains.kotlin.android`; Kotlin jvmTarget follows `compileOptions`.
- Annotation processing is KSP only (no kapt). Hilt modules live next to what they provide (`di/` package).
- ktlint (`ktlint_official` + Composable naming exception) runs on `./gradlew ktlintCheck`; fix with `ktlintFormat`.
- Unit tests sit in `src/test` (JUnit4, coroutines-test, Turbine, MockK, MockWebServer 3 for the network).
  Instrumented tests in `src/androidTest` (Room migration test: `:core:database:connectedDebugAndroidTest`).
- Kotlin nests block comments: never write `/*` inside a KDoc (e.g. `/auth/*`), it silently breaks the whole module.
- Room schema changes: bump `DramaDatabase.version`, add an `AutoMigration` (or a `Migration` for destructive
  changes), build once so the new `schemas/.../N.json` is exported, commit it with the code.
- Firebase: `app/google-services.json` is gitignored; the Google services and Crashlytics plugins are applied only
  when the file exists, so CI builds green without it. Never commit the file.
- Release: R8 + resource shrinking are on; new reflection-based libraries need rules in `app/proguard-rules.pro`.
  Signing comes from `DRAMA_KEYSTORE_*` (env or `local.properties`), falling back to the debug key so
  `:app:bundleRelease` always builds. The CI `bundle` job (tags `v*`) signs and distributes only when secrets exist.
- Strings shown to users are resources (French source, EN/ES/PT translations); code, identifiers, log tags and
  comments are English. Never hard-code a user-facing string in Kotlin.
- Accessibility (S06-A1-03): every icon/button has a `contentDescription` (null only when decorative next to a
  text), clickable rows use `Role` + `semantics(mergeDescendants = true)`, section titles are `heading()`, touch
  targets are >= 48 dp (`DramaSizes.touchTarget`), text containers use `heightIn(min)` so 200 % font scale never clips.
- The server is the source of truth for balances, prices and entitlements: no monetisation logic on the client.
- Monetisation (S07-A1/A2): `WalletRepository` / `UnlockRepository` / `ShopRepository` (:domain) over `WalletApi` and
  `ShopApi` (contract v1.4); `WalletStore` (:data) mirrors the last `Wallet` the server sent and is fed by every
  answer that carries one (never add coins locally). Unlocks go through `UnlockEpisodeUseCase` with an idempotency
  key persisted per (user, episode) in DataStore (`UnlockKeyStore`); success flips the Room episode status
  (`CatalogDao.markEpisodesUnlocked`) so grids update by themselves. `/play` with `unlocked: true` does the same.
- Billing: the domain port is `BillingGateway`; `:core:billing` holds `PlayBillingGateway` (Play Billing 7) and
  `FakeBillingGateway` (debug/benchmark, `BuildConfig.FAKE_BILLING`, `-PdramaFakeBilling`). Purchases are consumed /
  acknowledged only in `VerifyPurchase` after `POST /billing/google/verify` succeeded; `RestorePurchasesUseCase`
  replays what the store still holds (settings, shop, `AppStartup`). The fake store asks through
  `BillingGateway.prompt`, rendered by the shop screen; never branch on the fake type in a feature.
- Paywall (M-20): `PlayerViewModel` decides *when* (`PlayerUiState.paywall`), `PaywallViewModel` decides *what*
  (balance, unlock, auto-unlock); the sheet is drawn in the lower band over the whole video. Locked successors are
  never prefetched through `/play` (auto-unlock would debit them).
- Session replacement (DEF-006): `SessionManager.replacement` → `SessionRepository.sessionReplacement` →
  `SessionReplacementBanner` in :app.
