package com.drama.core.database

import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.RoomDatabase
import com.drama.core.database.dao.CatalogDao
import com.drama.core.database.dao.FavoritesDao
import com.drama.core.database.dao.WatchHistoryDao
import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.database.entity.CacheMetaEntity
import com.drama.core.database.entity.EpisodeEntity
import com.drama.core.database.entity.FavoriteEntity
import com.drama.core.database.entity.HomeBannerEntity
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
 * - v3 (S03-A1-01): configured banners (`home_banners`) and `home_rows.type`. Auto-migration 2 -> 3 (additive).
 * - v4 (S05-A1-02): `favorites` table, `series.likes` / `series.liked`. Auto-migration 3 -> 4 (additive).
 */
@Database(
    entities = [
        WatchProgressEntity::class,
        WatchHistoryEntity::class,
        SeriesEntity::class,
        EpisodeEntity::class,
        HomeRowEntity::class,
        HomeRowItemEntity::class,
        HomeBannerEntity::class,
        CacheMetaEntity::class,
        FavoriteEntity::class,
    ],
    version = 4,
    exportSchema = true,
    autoMigrations = [
        AutoMigration(from = 1, to = 2),
        AutoMigration(from = 2, to = 3),
        AutoMigration(from = 3, to = 4),
    ],
)
abstract class DramaDatabase : RoomDatabase() {
    abstract fun watchProgressDao(): WatchProgressDao

    abstract fun watchHistoryDao(): WatchHistoryDao

    abstract fun catalogDao(): CatalogDao

    abstract fun favoritesDao(): FavoritesDao

    companion object {
        const val NAME = "drama.db"
    }
}
