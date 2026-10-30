plugins {
    alias(libs.plugins.drama.android.feature)
}

android {
    namespace = "com.drama.feature.wallet"
}

dependencies {
    // ActivityBillingHost + BillingConfig only; the store itself stays behind the domain BillingGateway port.
    implementation(project(":core:billing"))
    implementation(libs.androidx.activity.compose)
}
