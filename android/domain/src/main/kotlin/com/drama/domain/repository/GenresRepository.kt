package com.drama.domain.repository

import com.drama.domain.model.GenreLabels
import kotlinx.coroutines.flow.Flow

/**
 * Localised genre labels (DEF-012, `GET /genres?lang`). One fetch per app language, cached in memory; the flow
 * emits [GenreLabels.EMPTY] until the first answer so callers fall back to the capitalised key meanwhile.
 */
interface GenresRepository {
    val labels: Flow<GenreLabels>

    /** Fetches the labels for the current app language when not cached yet (or [force]). */
    suspend fun refresh(force: Boolean = false): GenreLabels
}
