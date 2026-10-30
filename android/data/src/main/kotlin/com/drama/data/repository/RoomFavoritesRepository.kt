package com.drama.data.repository

import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppError
import com.drama.core.common.result.AppResult
import com.drama.core.common.result.map
import com.drama.core.common.time.Clock
import com.drama.core.database.dao.CatalogDao
import com.drama.core.database.dao.FavoritesDao
import com.drama.core.database.entity.FavoriteEntity
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.CatalogApi
import com.drama.core.network.api.UserApi
import com.drama.core.network.call
import com.drama.core.network.dto.SeriesSummaryDto
import com.drama.data.mapper.toDomain
import com.drama.data.mapper.toEntity
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.LikeState
import com.drama.domain.model.Series
import com.drama.domain.repository.FavoritesRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import retrofit2.HttpException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * "Ma liste" and "J'aime" over the API with a Room cache (S05-A1-02). Toggles are optimistic: the local row
 * changes first, the server call follows, a failure restores the previous state and surfaces the error.
 */
@Singleton
class RoomFavoritesRepository
    @Inject
    constructor(
        private val userApi: UserApi,
        private val catalogApi: CatalogApi,
        private val favoritesDao: FavoritesDao,
        private val catalogDao: CatalogDao,
        private val errorMapper: ApiErrorMapper,
        private val media: MediaUrlResolver,
        private val json: Json,
        private val clock: Clock,
        private val logger: Logger,
    ) : FavoritesRepository {
        override fun observeFavorites(): Flow<List<Series>> =
            favoritesDao.observeFavoriteSeries().map { list -> list.map { it.toDomain() } }.distinctUntilChanged()

        override fun observeFavoriteIds(): Flow<Set<String>> =
            favoritesDao.observeIds().map { it.toSet() }.distinctUntilChanged()

        override fun observeIsFavorite(seriesId: String): Flow<Boolean> =
            favoritesDao.observeIsFavorite(seriesId).distinctUntilChanged()

        override suspend fun refreshFavorites(): AppResult<Unit> =
            fetchAllFavorites()
                .map { summaries ->
                    val now = clock.nowEpochMs()
                    val series = summaries.map { it.toDomain(media) }
                    catalogDao.upsertSeries(
                        series.map { it.toEntity(now, detail = false, previous = catalogDao.getSeries(it.id)) },
                    )
                    favoritesDao.replaceAll(
                        series.mapIndexed { index, s -> FavoriteEntity(s.id, position = index, addedAtEpochMs = now) },
                    )
                }

        override suspend fun setFavorite(
            series: Series,
            favorite: Boolean,
        ): AppResult<Unit> {
            val previous = favoritesDao.get(series.id)
            val now = clock.nowEpochMs()
            // Optimistic local write (the series row is needed for the join).
            if (catalogDao.getSeries(series.id) == null) {
                catalogDao.upsertSeries(listOf(series.toEntity(now, detail = false)))
            }
            if (favorite) {
                if (previous ==
                    null
                ) {
                    favoritesDao.upsert(FavoriteEntity(series.id, favoritesDao.nextTopPosition(), now))
                }
            } else {
                favoritesDao.deleteById(series.id)
            }
            val result =
                if (favorite) {
                    addRemote(series.id)
                } else {
                    errorMapper.call { userApi.removeFavorite(series.id).requireSuccess() }
                }
            return when (result) {
                is AppResult.Success -> AppResult.Success(Unit)
                is AppResult.Failure -> {
                    logger.w(
                        TAG,
                        "favorite ${if (favorite) "add" else "remove"} failed for ${series.id}: ${result.error}",
                    )
                    // Rollback.
                    if (previous != null) favoritesDao.upsert(previous) else favoritesDao.deleteById(series.id)
                    result
                }
            }
        }

        /** Walks `GET /me/favorites` page by page (the server caps `pageSize` at [PAGE_SIZE]). */
        private suspend fun fetchAllFavorites(): AppResult<List<SeriesSummaryDto>> {
            val all = mutableListOf<SeriesSummaryDto>()
            var page = 1
            while (page <= MAX_PAGES) {
                val result = errorMapper.call { userApi.favorites(page = page, pageSize = PAGE_SIZE) }
                val dto =
                    when (result) {
                        is AppResult.Failure -> return result
                        is AppResult.Success -> result.value
                    }
                all += dto.items.mapNotNull(::decodeSeries)
                val total = dto.total ?: all.size
                if (dto.items.isEmpty() || all.size >= total) break
                page++
            }
            return AppResult.Success(all)
        }

        /** v1.2 is an idempotent PUT; a backend still on the v1 stub only routes POST. */
        private suspend fun addRemote(seriesId: String): AppResult<Unit> {
            val put = errorMapper.call { userApi.addFavorite(seriesId).requireSuccess() }
            if (put is AppResult.Success) return put
            val error = (put as AppResult.Failure).error
            val notRouted =
                error is AppError.NotFound || (error is AppError.Http && error.code == HTTP_METHOD_NOT_ALLOWED)
            if (!notRouted) return put
            return errorMapper.call { userApi.addFavoriteLegacy(seriesId).requireSuccess() }
        }

        override fun observeLikeState(seriesId: String): Flow<LikeState?> =
            catalogDao
                .observeSeries(seriesId)
                .map { entity -> entity?.likes?.let { LikeState(it, entity.liked) } }
                .distinctUntilChanged()

        override suspend fun setLiked(
            seriesId: String,
            liked: Boolean,
        ): AppResult<LikeState> {
            val before = catalogDao.getSeries(seriesId)
            val optimistic =
                LikeState(
                    likes = ((before?.likes ?: 0) + if (liked) 1 else -1).coerceAtLeast(0),
                    liked = liked,
                )
            catalogDao.updateLike(seriesId, optimistic.liked, optimistic.likes)
            val result =
                errorMapper.call { if (liked) catalogApi.like(seriesId) else catalogApi.unlike(seriesId) }
            return when (result) {
                is AppResult.Success -> {
                    val server = LikeState(result.value.likes, result.value.liked)
                    catalogDao.updateLike(seriesId, server.liked, server.likes)
                    AppResult.Success(server)
                }
                is AppResult.Failure -> {
                    logger.w(TAG, "like toggle failed for $seriesId: ${result.error}")
                    catalogDao.updateLike(seriesId, before?.liked ?: false, before?.likes)
                    result
                }
            }
        }

        override suspend fun clear() = favoritesDao.clear()

        /** v1.2 item = `SeriesSummary`; v1 item = `{series, createdAt}`. */
        private fun decodeSeries(element: JsonElement): SeriesSummaryDto? {
            val obj = element as? JsonObject ?: return null
            val payload = (obj["series"] as? JsonObject) ?: obj
            return try {
                json.decodeFromJsonElement(SeriesSummaryDto.serializer(), payload.jsonObject)
            } catch (e: IllegalArgumentException) {
                logger.w(TAG, "favorite item ignored: ${e.message}")
                null
            }
        }

        private fun <T> retrofit2.Response<T>.requireSuccess() {
            if (!isSuccessful) throw HttpException(this)
        }

        private companion object {
            const val TAG = "Favorites"

            /** Server maximum for `pageSize` (`VALIDATION_ERROR` above). */
            const val PAGE_SIZE = 50
            const val MAX_PAGES = 20
            const val HTTP_METHOD_NOT_ALLOWED = 405
        }
    }
