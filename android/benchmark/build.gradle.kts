plugins {
    alias(libs.plugins.android.test)
}

// S06-A2-01/02: macrobenchmark + baseline profile generator against the app's `benchmark` build type
// (release bytecode, debug key, local backend). Runs on a device / emulator only:
//   ./gradlew :benchmark:connectedBenchmarkAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.drama.benchmark.BaselineProfileGenerator
// then copy the generated profile to app/src/main/baseline-prof.txt (see android/README.md).
android {
    namespace = "com.drama.benchmark"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        // Macrobenchmark needs API 23+, baseline profile generation API 28+ (33+ on user builds).
        minSdk = 28
        targetSdk = libs.versions.targetSdk.get().toInt()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        // Matches the app's `benchmark` type; this module itself stays debuggable (instrumentation).
        create("benchmark") {
            isDebuggable = true
            signingConfig = getByName("debug").signingConfig
            matchingFallbacks += listOf("release")
        }
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

dependencies {
    implementation(libs.androidx.test.ext.junit)
    implementation(libs.androidx.test.espresso.core)
    implementation(libs.androidx.test.uiautomator)
    implementation(libs.androidx.benchmark.macro.junit4)
}

androidComponents {
    beforeVariants(selector().all()) { variant ->
        variant.enable = variant.buildType == "benchmark"
    }
}
