package com.drama.data.cache

import com.drama.core.common.result.AppResult
import com.drama.core.common.result.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

/**
 * Stale-while-revalidate for one cache slice:
 * 1. a fresh cache hit (younger than [ttlMs]) is served without any network call, then kept observed;
 * 2. otherwise the cached value (if any) is emitted as [Resource.Loading], the refresh runs, and the flow
 *    continues with the cache observation (which now carries the refreshed value) as [Resource.Success];
 * 3. a failed refresh ends the flow with [Resource.Error] carrying the stale value, so the screen stays
 *    usable offline and can offer a retry.
 */
fun <T : Any> staleWhileRevalidate(
    nowEpochMs: () -> Long,
    ttlMs: Long,
    fetchedAt: suspend () -> Long?,
    readCache: suspend () -> T?,
    observeCache: () -> Flow<T?>,
    refresh: suspend () -> AppResult<Unit>,
): Flow<Resource<T>> =
    flow {
        val cached = readCache()
        val isFresh = cached != null && isFresh(fetchedAt(), nowEpochMs(), ttlMs)
        if (isFresh) {
            emitAll(observeCache().filterNotNull().map { Resource.Success(it, fromCache = true) })
            return@flow
        }
        emit(Resource.Loading(cached))
        when (val result = refresh()) {
            is AppResult.Success -> emitAll(observeCache().filterNotNull().map { Resource.Success(it) })
            is AppResult.Failure -> emit(Resource.Error(result.error, cached))
        }
    }

fun isFresh(
    fetchedAtEpochMs: Long?,
    nowEpochMs: Long,
    ttlMs: Long,
): Boolean = fetchedAtEpochMs != null && nowEpochMs - fetchedAtEpochMs in 0..ttlMs
