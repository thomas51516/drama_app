plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.android.compose)
}

android {
    namespace = "com.drama.core.ui"
    // Shared user-facing strings (retry, offline, back, ...) in four languages (S05-A2-03).
    androidResources.enable = true
}

dependencies {
    api(libs.androidx.compose.material3)
    api(libs.androidx.compose.foundation)
    api(libs.androidx.compose.ui)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    // Custom Tabs for the recharge site (M-34).
    implementation(libs.androidx.browser)
}
