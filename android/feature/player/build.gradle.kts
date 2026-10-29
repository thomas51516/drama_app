plugins {
    alias(libs.plugins.drama.android.feature)
}

android {
    namespace = "com.drama.feature.player"

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(libs.androidx.media3.common)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.exoplayer.hls)
    implementation(libs.androidx.media3.datasource)
    implementation(libs.androidx.media3.database)
    implementation(libs.androidx.media3.ui.compose)
    // SubtitleView + CaptionStyleCompat (M-14): the Compose ContentFrame renders video only.
    implementation(libs.androidx.media3.ui)
    implementation(libs.androidx.activity.compose)
}
