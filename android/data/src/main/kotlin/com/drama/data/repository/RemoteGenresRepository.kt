package com.drama.data.repository

import com.drama.core.common.locale.DeviceLocaleProvider
import com.drama.core.common.logging.Logger
import com.drama.core.common.result.AppResult
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.RankingsApi
import com.drama.core.network.call
import com.drama.data.mapper.toDomain
import com.drama.domain.model.GenreLabels
import com.drama.domain.repository.GenresRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * `GET /genres?lang` (DEF-012): one fetch per app language, cached for the process. The flow re-emits
 * [GenreLabels.EMPTY] when the language changed and the new labels are not known yet.
 */
@Singleton
class RemoteGenresRepository
    @Inject
    constructor(
        private val api: RankingsApi,
        private val deviceLocale: DeviceLocaleProvider,
        private val errorMapper: ApiErrorMapper,
        private val logger: Logger,
    ) : GenresRepository {
        private val mutex = Mutex()
        private val cache = mutableMapOf<String, GenreLabels>()
        private val labelsFlow = MutableStateFlow(GenreLabels.EMPTY)

        override val labels: Flow<GenreLabels> = labelsFlow.asStateFlow()

        override suspend fun refresh(force: Boolean): GenreLabels {
            val language = deviceLocale.language
            mutex.withLock {
                val cached = cache[language]
                if (cached != null && !force) {
                    labelsFlow.value = cached
                    return cached
                }
                return when (val result = errorMapper.call { api.genres(language) }) {
                    is AppResult.Success -> {
                        val labels = result.value.toDomain()
                        cache[language] = labels
                        labelsFlow.value = labels
                        labels
                    }
                    is AppResult.Failure -> {
                        logger.w(TAG, "GET /genres?lang=$language failed: ${result.error}")
                        // Keep what we have only when it is for the same language; otherwise fall back to the keys.
                        if (cached == null) labelsFlow.value = GenreLabels.EMPTY
                        cached ?: GenreLabels.EMPTY
                    }
                }
            }
        }

        private companion object {
            const val TAG = "Genres"
        }
    }
