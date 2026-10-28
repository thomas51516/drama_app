plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.drama.core.network"

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        // Emulator loopback to the NestJS backend. Override with -PdramaApiBaseUrl=... if needed.
        val baseUrl = (project.findProperty("dramaApiBaseUrl") as String?) ?: "http://10.0.2.2:3000/"
        buildConfigField("String", "API_BASE_URL", "\"$baseUrl\"")
        // Base des médias de dev (MinIO, bucket drama-media). Pour un téléphone physique sur le même Wi-Fi :
        // -PdramaMediaBaseUrl=http://<IP-du-PC>:9000/drama-media
        val mediaBaseUrl =
            (project.findProperty("dramaMediaBaseUrl") as String?) ?: "http://10.0.2.2:9000/drama-media"
        buildConfigField("String", "MEDIA_BASE_URL", "\"${mediaBaseUrl.trimEnd('/')}\"")
    }

    buildTypes {
        release {
            buildConfigField("String", "API_BASE_URL", "\"https://api.drama.example/\"")
            buildConfigField("String", "MEDIA_BASE_URL", "\"https://cdn.drama.example\"")
        }
    }
}

dependencies {
    implementation(project(":core:common"))

    api(libs.retrofit)
    api(libs.okhttp)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
}
