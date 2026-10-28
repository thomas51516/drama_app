import com.android.build.api.dsl.LibraryExtension
import com.drama.buildlogic.configureAndroid
import com.drama.buildlogic.configureKtlint
import com.drama.buildlogic.libs
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies

class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.library")

            extensions.configure<LibraryExtension> {
                configureAndroid(this)
                // Library modules carry no Android resources (Compose only); keep them lean.
                androidResources.enable = false
                buildFeatures.resValues = false
            }

            configureKtlint()

            dependencies {
                add("implementation", libs.findLibrary("androidx-core-ktx").get())
                add("testImplementation", libs.findLibrary("junit").get())
                add("testImplementation", libs.findLibrary("kotlinx-coroutines-test").get())
                add("androidTestImplementation", libs.findLibrary("androidx-test-ext-junit").get())
            }
        }
    }
}
