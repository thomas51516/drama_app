package com.drama.core.database

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Replays every exported schema (core/database/schemas) and checks the v1 -> v2 auto-migration keeps the
 * Sprint 1 progress rows. Run on a device: `./gradlew :core:database:connectedDebugAndroidTest`.
 */
@RunWith(AndroidJUnit4::class)
class MigrationTest {
    @get:Rule
    val helper =
        MigrationTestHelper(
            InstrumentationRegistry.getInstrumentation(),
            DramaDatabase::class.java,
        )

    @Test
    fun migrate1To2_keepsWatchProgress() {
        helper.createDatabase(TEST_DB, 1).apply {
            execSQL(
                "INSERT INTO watch_progress (episodeId, seriesId, positionMs, durationMs, updatedAtEpochMs) " +
                    "VALUES ('ep1', 's1', 12000, 30000, 1700000000000)",
            )
            close()
        }

        val db = helper.runMigrationsAndValidate(TEST_DB, 2, true)
        db.query("SELECT episodeId, positionMs, completed FROM watch_progress").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals("ep1", cursor.getString(0))
            assertEquals(12000L, cursor.getLong(1))
            assertEquals(0, cursor.getInt(2))
        }
        db.query("SELECT COUNT(*) FROM watch_history").use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals(0, cursor.getInt(0))
        }
        db.close()
    }

    private companion object {
        const val TEST_DB = "migration-test.db"
    }
}
