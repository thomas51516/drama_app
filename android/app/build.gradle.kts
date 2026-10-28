plugins {
    alias(libs.plugins.drama.android.application)
    alias(libs.plugins.drama.android.compose)
    alias(libs.plugins.drama.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.drama.app"

    defaultConfig {
        applicationId = "com.drama.app"
        versionCode = 1
        versionName = "0.1.0"
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
}
