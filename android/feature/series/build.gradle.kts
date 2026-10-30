plugins {
    alias(libs.plugins.drama.android.feature)
}

android {
    namespace = "com.drama.feature.series"
}

dependencies {
    // POST_NOTIFICATIONS request after the first favourite (M-54).
    implementation(libs.androidx.activity.compose)
}
