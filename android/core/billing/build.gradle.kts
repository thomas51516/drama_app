plugins {
    alias(libs.plugins.drama.android.library)
    alias(libs.plugins.drama.hilt)
}

android {
    namespace = "com.drama.core.billing"

    buildFeatures {
        buildConfig = true
    }

    // S07-A2-01: debug builds simulate the store (dialog success / pending / cancel, tokens `fake:<sku>:<uuid>`
    // accepted by the backend's fake verifier). Release talks to Google Play. Override: -PdramaFakeBilling=true|false.
    val fakeBillingOverride = (project.findProperty("dramaFakeBilling") as String?)?.toBooleanStrictOrNull()

    buildTypes {
        debug {
            buildConfigField("boolean", "FAKE_BILLING", "${fakeBillingOverride ?: true}")
        }
        release {
            buildConfigField("boolean", "FAKE_BILLING", "${fakeBillingOverride ?: false}")
        }
        // Same as the app's benchmark type: release bytecode against the local backend (fake verifier).
        create("benchmark") {
            initWith(getByName("release"))
            buildConfigField("boolean", "FAKE_BILLING", "${fakeBillingOverride ?: true}")
        }
    }
}

dependencies {
    implementation(project(":core:common"))
    implementation(project(":domain"))

    implementation(libs.play.billing.ktx)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.turbine)
    // Purchase flow test: FakeBillingGateway -> DefaultShopRepository over MockWebServer -> consume.
    testImplementation(project(":data"))
    testImplementation(project(":core:network"))
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.retrofit.converter.kotlinx.serialization)
    testImplementation(libs.kotlinx.serialization.json)
}
