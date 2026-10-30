package com.drama.benchmark

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Generates the baseline + startup profile of the app (S06-A2-02): cold start, home rendered, a scroll, the
 * "Pour vous" tab and the profile tab. The output lands in
 * `benchmark/build/outputs/connected_android_test_additional_output/.../BaselineProfileGenerator_generate-baseline-prof.txt`
 * and is committed as `app/src/main/baseline-prof.txt`.
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() =
        rule.collect(
            packageName = PACKAGE,
            includeInStartupProfile = true,
            maxIterations = 5,
        ) {
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), STARTUP_TIMEOUT_MS)
            // Let the home settle (banners + rows) then exercise the main lists.
            device.waitForIdle(IDLE_TIMEOUT_MS)
            device.swipe(device.displayWidth / 2, device.displayHeight * 3 / 4, device.displayWidth / 2, device.displayHeight / 4, 20)
            device.waitForIdle(IDLE_TIMEOUT_MS)
            tapTab(1) // Pour vous
            device.waitForIdle(IDLE_TIMEOUT_MS)
            tapTab(3) // Profil
            device.waitForIdle(IDLE_TIMEOUT_MS)
            tapTab(0) // Accueil
            device.waitForIdle(IDLE_TIMEOUT_MS)
        }

    /** Bottom bar: four equal tabs; tap by position so the generator does not depend on translated labels. */
    private fun androidx.benchmark.macro.MacrobenchmarkScope.tapTab(index: Int) {
        val x = device.displayWidth * (2 * index + 1) / 8
        val y = device.displayHeight - device.displayHeight / 24
        device.click(x, y)
    }

    companion object {
        const val PACKAGE = "com.drama.app"
        const val STARTUP_TIMEOUT_MS = 10_000L
        const val IDLE_TIMEOUT_MS = 3_000L
    }
}
