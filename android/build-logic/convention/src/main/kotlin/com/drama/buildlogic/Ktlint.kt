package com.drama.buildlogic

import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.jlleitschuh.gradle.ktlint.KtlintExtension

/** Applies ktlint to a module. `./gradlew ktlintCheck` verifies, `./gradlew ktlintFormat` fixes. */
internal fun Project.configureKtlint() {
    pluginManager.apply("org.jlleitschuh.gradle.ktlint")
    extensions.configure<KtlintExtension> {
        android.set(true)
        ignoreFailures.set(false)
        filter {
            exclude { element -> element.file.path.contains("/build/") }
        }
    }
}
