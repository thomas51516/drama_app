import java.util.Properties

plugins {
    alias(libs.plugins.drama.android.application)
    alias(libs.plugins.drama.android.compose)
    alias(libs.plugins.drama.hilt)
    alias(libs.plugins.kotlin.serialization)
}

// S02-A1-04: Firebase is opt-in by file. Drop the project's google-services.json in android/app/ and the
// Google services + Crashlytics plugins are applied; without it the build stays green and the app falls back
// to the Logcat analytics tracker. The file is gitignored (root .gitignore).
val googleServicesFile = layout.projectDirectory.file("google-services.json").asFile
val firebaseConfigured = googleServicesFile.exists()
if (firebaseConfigured) {
    apply(plugin = "com.google.gms.google-services")
    apply(plugin = "com.google.firebase.crashlytics")
    logger.lifecycle("Firebase: google-services.json found, Google services and Crashlytics plugins applied.")
} else {
    logger.lifecycle("Firebase: app/google-services.json absent, building without Google services (Logcat analytics).")
}

// S03-OPS-01: release signing from the environment (CI) or android/local.properties (developer machine).
// Keys: DRAMA_KEYSTORE_PATH, DRAMA_KEYSTORE_PASSWORD, DRAMA_KEY_ALIAS, DRAMA_KEY_PASSWORD. When any is missing
// the release build type falls back to the debug key so `:app:bundleRelease` always builds locally; such a
// bundle is debug-signed and must never be uploaded anywhere.
val localProperties =
    Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }

fun signingValue(key: String): String? =
    (System.getenv(key) ?: localProperties.getProperty(key))?.trim()?.takeIf { it.isNotEmpty() }

val releaseKeystorePath = signingValue("DRAMA_KEYSTORE_PATH")
val releaseKeystorePassword = signingValue("DRAMA_KEYSTORE_PASSWORD")
val releaseKeyAlias = signingValue("DRAMA_KEY_ALIAS")
val releaseKeyPassword = signingValue("DRAMA_KEY_PASSWORD")
val releaseKeystoreFile =
    releaseKeystorePath?.let { path ->
        file(path).takeIf { it.isAbsolute }
            ?: rootProject.file(path)
    }
val releaseSigningConfigured =
    releaseKeystoreFile?.exists() == true &&
        releaseKeystorePassword != null &&
        releaseKeyAlias != null &&
        releaseKeyPassword != null

// S04-A1-03: App Links host for share links (https://<host>/s/{seriesId}); the owner publishes
// /.well-known/assetlinks.json on it (see README). Override with -PdramaAppLinksHost=links.example.com.
val appLinksHost =
    (project.findProperty("dramaAppLinksHost") as String?)?.trim()?.takeIf { it.isNotEmpty() } ?: "links.drama.example"

// S05-A2-01: OAuth "Web application" client id for Google sign-in (Credential Manager). Empty = the option is
// shown as "non configuré". Sources, in order: -PdramaGoogleWebClientId, `drama.googleWebClientId` in
// android/local.properties (gitignored), env DRAMA_GOOGLE_WEB_CLIENT_ID (CI secret).
val googleWebClientId =
    (project.findProperty("dramaGoogleWebClientId") as String?)?.trim()?.takeIf { it.isNotEmpty() }
        ?: localProperties.getProperty("drama.googleWebClientId")?.trim()?.takeIf { it.isNotEmpty() }
        ?: System.getenv("DRAMA_GOOGLE_WEB_CLIENT_ID")?.trim()?.takeIf { it.isNotEmpty() }
        ?: ""

android {
    namespace = "com.drama.app"

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.drama.app"
        versionCode = (project.findProperty("dramaVersionCode") as String?)?.toIntOrNull() ?: 1
        versionName = (project.findProperty("dramaVersionName") as String?) ?: "0.3.0"
        buildConfigField("boolean", "FIREBASE_CONFIGURED", "$firebaseConfigured")
        buildConfigField("String", "APP_LINKS_HOST", "\"$appLinksHost\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
        manifestPlaceholders["appLinksHost"] = appLinksHost
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = releaseKeystoreFile
                storePassword = releaseKeystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                enableV1Signing = true
                enableV2Signing = true
            }
            logger.lifecycle("Signing: release keystore configured (${releaseKeystoreFile?.name}).")
        } else {
            logger.lifecycle(
                "Signing: DRAMA_KEYSTORE_* not set or keystore missing, release falls back to the debug key " +
                    "(local build only, not distributable).",
            )
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            // S03-OPS-01: R8 + resource shrinking on release (spec §7: obfuscation, AAB < 30 MB).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig =
                if (releaseSigningConfigured) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
        // S06-A2-02: release bytecode, debug key, local backend reachable (src/benchmark manifest allows cleartext and
        // marks the app profileable). Used by :benchmark (macrobenchmark + baseline profile) and the startup
        // measurements of the README; never distributed.
        create("benchmark") {
            initWith(getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            isDebuggable = false
            // Real class names in the generated profile (see benchmark-rules.pro).
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
                "benchmark-rules.pro",
            )
        }
    }

    bundle {
        // Language split off (S05-A2-03): the in-app selector (AppCompat per-app locales) needs every translation
        // on the device, and the four string tables weigh a few dozen KB.
        language.enableSplit = false
        density.enableSplit = true
        abi.enableSplit = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:ui"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    implementation(project(":domain"))
    implementation(project(":data"))
    implementation(project(":feature:home"))
    implementation(project(":feature:player"))
    implementation(project(":feature:series"))
    implementation(project(":feature:account"))
    implementation(project(":feature:feed"))
    implementation(project(":feature:search"))
    implementation(project(":feature:mylist"))
    implementation(project(":feature:help"))
    implementation(project(":feature:notifications"))

    // Per-app locales (S05-A1-03) and the baseline profile installer (S06-A2-02).
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.profileinstaller)

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // Coil image loader configured once here (SVG decoder for the dev placeholders, OkHttp network fetcher).
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.coil.svg)

    // Firebase SDKs are always compiled in (the tracker picks Firebase or Logcat at runtime); only the
    // Gradle plugins depend on google-services.json.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.messaging)
}
