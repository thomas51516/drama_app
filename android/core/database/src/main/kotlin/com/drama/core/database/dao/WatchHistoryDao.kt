package com.drama.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.drama.core.database.entity.WatchHistoryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WatchHistoryDao {
    @Upsert
    suspend fun upsert(entry: WatchHistoryEntity)

    @Query("SELECT * FROM watch_history ORDER BY lastWatchedAtEpochMs DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<WatchHistoryEntity>>

    @Query("SELECT * FROM watch_history WHERE seriesId = :seriesId")
    suspend fun getBySeries(seriesId: String): WatchHistoryEntity?

    @Query("SELECT * FROM watch_history WHERE seriesId = :seriesId")
    fun observeBySeries(seriesId: String): Flow<WatchHistoryEntity?>

    @Query("DELETE FROM watch_history")
    suspend fun clear()
}
