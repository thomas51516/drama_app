plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
}

android {
    namespace = "com.drama.core.player"

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":domain"))

    // The only module that touches ExoPlayer: the feed and the player features drive it through PlaybackEngine.
    api(libs.androidx.media3.common)
    api(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.exoplayer.hls)
    implementation(libs.androidx.media3.datasource)
    implementation(libs.androidx.media3.database)
    implementation(libs.kotlinx.coroutines.android)
}
