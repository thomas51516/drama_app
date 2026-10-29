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

android {
    namespace = "com.drama.app"

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.drama.app"
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("boolean", "FIREBASE_CONFIGURED", "$firebaseConfigured")
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            // R8 is enabled from Sprint 6 (performance sprint); keep the spike readable in Logcat for now.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
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

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // Firebase SDKs are always compiled in (the tracker picks Firebase or Logcat at runtime); only the
    // Gradle plugins depend on google-services.json.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.crashlytics)
}
