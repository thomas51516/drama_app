package com.drama.buildlogic

import com.android.build.api.dsl.CommonExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Project

/**
 * Shared Android configuration for application and library modules.
 * AGP 9 DSL: nested blocks are plain properties here (the `block { }` helpers only exist in build scripts).
 * With built-in Kotlin, the Kotlin jvmTarget follows compileOptions.targetCompatibility.
 */
internal fun Project.configureAndroid(extension: CommonExtension) {
    extension.apply {
        compileSdk = libs.versionInt("compileSdk")

        defaultConfig.apply {
            minSdk = libs.versionInt("minSdk")
            testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        }

        compileOptions.apply {
            sourceCompatibility = JavaVersion.VERSION_17
            targetCompatibility = JavaVersion.VERSION_17
        }

        lint.apply {
            abortOnError = true
            warningsAsErrors = false
            checkDependencies = false
            disable += setOf("IconMissingDensityFolder")
        }
    }
}
