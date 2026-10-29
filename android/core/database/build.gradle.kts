plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
    alias(libs.plugins.room)
}

android {
    namespace = "com.drama.core.database"
}

room {
    schemaDirectory("$projectDir/schemas")
}

dependencies {
    implementation(project(":core:common"))

    api(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    api(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)

    androidTestImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.kotlinx.coroutines.test)
}
