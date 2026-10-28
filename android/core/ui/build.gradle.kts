plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.android.compose)
}

android {
    namespace = "com.drama.core.ui"
}

dependencies {
    api(libs.androidx.compose.material3)
    api(libs.androidx.compose.foundation)
    api(libs.androidx.compose.ui)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
}
