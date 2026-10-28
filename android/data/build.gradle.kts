plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
}

android {
    namespace = "com.drama.data"
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    api(project(":domain"))

    implementation(libs.kotlinx.coroutines.android)
}
