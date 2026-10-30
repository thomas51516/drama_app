package com.drama.domain.repository

import com.drama.core.common.result.AppResult
import com.drama.domain.model.LikeState
import com.drama.domain.model.Series
import kotlinx.coroutines.flow.Flow

/**
 * "Ma liste" and "J'aime" (M-16). Both toggles are optimistic: the local state flips at once, the server call
 * follows, and a failure rolls the local state back and returns the error. Favorites are cached in Room so the
 * list is readable offline; the server copy is the source of truth after every [refreshFavorites].
 */
interface FavoritesRepository {
    /** Cached list, newest first; empty until the first refresh or the first local add. */
    fun observeFavorites(): Flow<List<Series>>

    fun observeFavoriteIds(): Flow<Set<String>>

    fun observeIsFavorite(seriesId: String): Flow<Boolean>

    /** `GET /me/favorites`, replaces the cache. */
    suspend fun refreshFavorites(): AppResult<Unit>

    /**
     * Adds or removes [series] (optimistic). [series] is kept in the cache so the list shows it offline; when
     * only the id is known pass a stub with the id, the next refresh completes it.
     */
    suspend fun setFavorite(
        series: Series,
        favorite: Boolean,
    ): AppResult<Unit>

    /** Last known like state of a series (from the catalogue or the last toggle); null when unknown. */
    fun observeLikeState(seriesId: String): Flow<LikeState?>

    /** `POST`/`DELETE /series/{id}/like` (optimistic); the server's count wins when it answers. */
    suspend fun setLiked(
        seriesId: String,
        liked: Boolean,
    ): AppResult<LikeState>

    /** Drops everything cached (logout). */
    suspend fun clear()
}
