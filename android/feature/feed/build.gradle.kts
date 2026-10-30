plugins {
    alias(libs.plugins.drama.android.feature)
}

android {
    namespace = "com.drama.feature.feed"

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(project(":core:player"))

    implementation(libs.androidx.media3.common)
    implementation(libs.androidx.media3.ui.compose)
}
