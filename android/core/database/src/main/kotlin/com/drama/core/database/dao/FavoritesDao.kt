package com.drama.core.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import com.drama.core.database.entity.FavoriteEntity
import com.drama.core.database.entity.SeriesEntity
import kotlinx.coroutines.flow.Flow

/** "Ma liste" cache (M-16, schema v4). Series rows are shared with the catalogue cache. */
@Dao
interface FavoritesDao {
    @Query(
        "SELECT series.* FROM favorites INNER JOIN series ON series.id = favorites.seriesId " +
            "ORDER BY favorites.position ASC, favorites.addedAtEpochMs DESC",
    )
    fun observeFavoriteSeries(): Flow<List<SeriesEntity>>

    @Query("SELECT seriesId FROM favorites")
    fun observeIds(): Flow<List<String>>

    @Query("SELECT EXISTS(SELECT 1 FROM favorites WHERE seriesId = :seriesId)")
    fun observeIsFavorite(seriesId: String): Flow<Boolean>

    @Query("SELECT * FROM favorites WHERE seriesId = :seriesId")
    suspend fun get(seriesId: String): FavoriteEntity?

    @Query("SELECT COALESCE(MIN(position), 0) - 1 FROM favorites")
    suspend fun nextTopPosition(): Int

    @Upsert
    suspend fun upsert(favorite: FavoriteEntity)

    @Upsert
    suspend fun upsertAll(favorites: List<FavoriteEntity>)

    @Delete
    suspend fun delete(favorite: FavoriteEntity)

    @Query("DELETE FROM favorites WHERE seriesId = :seriesId")
    suspend fun deleteById(seriesId: String)

    @Query("DELETE FROM favorites")
    suspend fun clear()

    @Transaction
    suspend fun replaceAll(favorites: List<FavoriteEntity>) {
        clear()
        upsertAll(favorites)
    }
}
