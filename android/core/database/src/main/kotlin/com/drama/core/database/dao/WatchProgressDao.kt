package com.drama.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.drama.core.database.entity.WatchProgressEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface WatchProgressDao {
    @Upsert
    suspend fun upsert(progress: WatchProgressEntity)

    @Query("SELECT * FROM watch_progress WHERE episodeId = :episodeId")
    suspend fun getByEpisode(episodeId: String): WatchProgressEntity?

    @Query("SELECT * FROM watch_progress WHERE seriesId = :seriesId ORDER BY updatedAtEpochMs DESC")
    fun observeBySeries(seriesId: String): Flow<List<WatchProgressEntity>>

    @Query("DELETE FROM watch_progress")
    suspend fun clear()
}
