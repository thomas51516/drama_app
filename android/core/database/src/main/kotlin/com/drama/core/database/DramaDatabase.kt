package com.drama.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.drama.core.database.dao.WatchProgressDao
import com.drama.core.database.entity.WatchProgressEntity

@Database(
    entities = [WatchProgressEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class DramaDatabase : RoomDatabase() {
    abstract fun watchProgressDao(): WatchProgressDao

    companion object {
        const val NAME = "drama.db"
    }
}
