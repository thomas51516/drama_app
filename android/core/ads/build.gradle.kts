plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
}

android {
    namespace = "com.drama.core.ads"

    buildFeatures {
        buildConfig = true
    }

    // S08-A1-01: debug builds simulate the ad network (full-screen 5 s countdown, then the app plays the fake SSV
    // callback accepted by the backend's `AD_PROVIDER=fake`). Release talks to AdMob. Override: -PdramaFakeAds=true|false.
    val fakeAdsOverride = (project.findProperty("dramaFakeAds") as String?)?.toBooleanStrictOrNull()

    buildTypes {
        debug {
            buildConfigField("boolean", "FAKE_ADS", "${fakeAdsOverride ?: true}")
        }
        release {
            buildConfigField("boolean", "FAKE_ADS", "${fakeAdsOverride ?: false}")
        }
        create("benchmark") {
            initWith(getByName("release"))
            buildConfigField("boolean", "FAKE_ADS", "${fakeAdsOverride ?: true}")
        }
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":domain"))

    implementation(libs.play.services.ads)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.turbine)
}
