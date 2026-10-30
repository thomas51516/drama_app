import java.util.Properties

plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
    alias(libs.plugins.kotlin.serialization)
}

// S08-A1-01: HMAC secret of the backend's `fake` ad SSV verifier (AD_SSV_FAKE_SECRET), so a debug build can play the
// SSV callback of the simulated ad itself. Sources: -PdramaAdSsvFakeSecret, `drama.adSsvFakeSecret` in
// android/local.properties (gitignored), env DRAMA_AD_SSV_FAKE_SECRET. Never compiled into release builds.
val localProperties =
    Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }
val adSsvFakeSecret =
    (project.findProperty("dramaAdSsvFakeSecret") as String?)?.trim()?.takeIf { it.isNotEmpty() }
        ?: localProperties.getProperty("drama.adSsvFakeSecret")?.trim()?.takeIf { it.isNotEmpty() }
        ?: System.getenv("DRAMA_AD_SSV_FAKE_SECRET")?.trim()?.takeIf { it.isNotEmpty() }
        ?: ""

android {
    namespace = "com.drama.core.network"

    buildFeatures {
        buildConfig = true
    }

    // Emulator loopback to the NestJS backend. Override with -PdramaApiBaseUrl=... if needed.
    val baseUrl = (project.findProperty("dramaApiBaseUrl") as String?) ?: "http://10.0.2.2:3000/"
    // Base des médias de dev (MinIO, bucket drama-media). Pour un téléphone physique sur le même Wi-Fi :
    // -PdramaMediaBaseUrl=http://<IP-du-PC>:9000/drama-media
    val mediaBaseUrl =
        (project.findProperty("dramaMediaBaseUrl") as String?) ?: "http://10.0.2.2:9000/drama-media"
    // Debug toggle: -PdramaUseFakeCatalog=true serves the Sprint 1 fake catalogue instead of the API.
    val useFakeCatalog = (project.findProperty("dramaUseFakeCatalog") as String?)?.toBoolean() ?: false

    defaultConfig {
        buildConfigField("String", "API_BASE_URL", "\"$baseUrl\"")
        buildConfigField("String", "MEDIA_BASE_URL", "\"${mediaBaseUrl.trimEnd('/')}\"")
        buildConfigField("boolean", "USE_FAKE_CATALOG", "$useFakeCatalog")
        buildConfigField("String", "AD_SSV_FAKE_SECRET", "\"$adSsvFakeSecret\"")
    }

    buildTypes {
        // Matches the app's `benchmark` type: release settings but the dev URLs of defaultConfig (S06-A2-02).
        create("benchmark") {
            initWith(getByName("release"))
            buildConfigField("String", "API_BASE_URL", "\"$baseUrl\"")
            buildConfigField("String", "MEDIA_BASE_URL", "\"${mediaBaseUrl.trimEnd('/')}\"")
            buildConfigField("boolean", "USE_FAKE_CATALOG", "$useFakeCatalog")
            buildConfigField("String", "AD_SSV_FAKE_SECRET", "\"$adSsvFakeSecret\"")
        }
        release {
            buildConfigField("String", "API_BASE_URL", "\"https://api.drama.example/\"")
            buildConfigField("String", "MEDIA_BASE_URL", "\"https://cdn.drama.example\"")
            buildConfigField("boolean", "USE_FAKE_CATALOG", "false")
            buildConfigField("String", "AD_SSV_FAKE_SECRET", "\"\"")
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

    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.turbine)
}
