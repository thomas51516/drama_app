plugins {
    alias(libs.plugins.drama.android.feature)
}

android {
    namespace = "com.drama.feature.account"
}

dependencies {
    implementation(libs.androidx.activity.compose)
    // Google sign-in through Credential Manager (M-51): the ID token is verified by the backend.
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)
}
