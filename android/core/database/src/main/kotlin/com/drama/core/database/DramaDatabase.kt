package com.drama.core.database

import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.RoomDatabase
import com.drama.core.database.dao.CatalogDao
import com.drama.core.database.dao.WatchHistoryDao
import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.database.entity.CacheMetaEntity
import com.drama.core.database.entity.EpisodeEntity
import com.drama.core.database.entity.HomeRowEntity
import com.drama.core.database.entity.HomeRowItemEntity
import com.drama.core.database.entity.SeriesEntity
import com.drama.core.database.entity.WatchHistoryEntity
import com.drama.core.database.entity.WatchProgressEntity

/**
 * Schema history (exported to core/database/schemas, committed):
 * - v1 (S01): `watch_progress`.
 * - v2 (S02-A1-03): `watch_progress.completed`, `watch_history`, catalogue cache (`series`, `episodes`,
 *   `home_rows`, `home_row_items`, `cache_meta`). Auto-migration 1 -> 2 (additive only).
 */
@Database(
    entities = [
        WatchProgressEntity::class,
        WatchHistoryEntity::class,
        SeriesEntity::class,
        EpisodeEntity::class,
        HomeRowEntity::class,
        HomeRowItemEntity::class,
        CacheMetaEntity::class,
    ],
    version = 2,
    exportSchema = true,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
)
abstract class DramaDatabase : RoomDatabase() {
    abstract fun watchProgressDao(): WatchProgressDao

    abstract fun watchHistoryDao(): WatchHistoryDao

    abstract fun catalogDao(): CatalogDao

    companion object {
        const val NAME = "drama.db"
    }
}
