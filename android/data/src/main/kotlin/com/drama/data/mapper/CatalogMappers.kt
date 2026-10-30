package com.drama.data.mapper

import com.drama.core.database.entity.EpisodeEntity
import com.drama.core.database.entity.SeriesEntity
import com.drama.core.database.entity.WatchHistoryEntity
import com.drama.core.database.entity.WatchProgressEntity
import com.drama.core.network.dto.AuthUserDto
import com.drama.core.network.dto.EpisodeSummaryDto
import com.drama.core.network.dto.FeedEpisodeDto
import com.drama.core.network.dto.FeedItemDto
import com.drama.core.network.dto.HomeBannerDto
import com.drama.core.network.dto.HomeRowDto
import com.drama.core.network.dto.PlaySessionDto
import com.drama.core.network.dto.PlaySubtitleDto
import com.drama.core.network.dto.SeriesDetailDto
import com.drama.core.network.dto.SeriesSummaryDto
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.AuthProvider
import com.drama.domain.model.Episode
import com.drama.domain.model.EpisodeAccess
import com.drama.domain.model.FeedItem
import com.drama.domain.model.HomeBanner
import com.drama.domain.model.HomeItem
import com.drama.domain.model.HomeRow
import com.drama.domain.model.HomeRowType
import com.drama.domain.model.PlaySession
import com.drama.domain.model.PlaybackSource
import com.drama.domain.model.Series
import com.drama.domain.model.StreamFormat
import com.drama.domain.model.Subtitle
import com.drama.domain.model.UserProfile
import com.drama.domain.model.WatchHistoryEntry
import com.drama.domain.model.WatchProgress
import java.time.Instant
import java.time.format.DateTimeParseException

private const val MS_PER_SECOND = 1_000.0

// --- DTO -> domain ---

fun SeriesSummaryDto.toDomain(media: MediaUrlResolver): Series =
    Series(
        id = id,
        slug = slug,
        title = title,
        synopsis = "",
        posterVerticalUrl = media.resolve(posterVerticalUrl),
        posterHorizontalUrl = media.resolve(posterHorizontalUrl),
        genres = genres,
        episodeCount = episodeCount,
        freeEpisodeCount = freeEpisodeCount,
        coinCostPerEpisode = coinCostPerEpisode,
        ageRating = ageRating,
        likes = likes,
    )

fun SeriesDetailDto.toDomain(media: MediaUrlResolver): Series =
    Series(
        id = id,
        slug = slug,
        title = title,
        synopsis = synopsis,
        posterVerticalUrl = media.resolve(posterVerticalUrl),
        posterHorizontalUrl = media.resolve(posterHorizontalUrl),
        genres = genres,
        episodeCount = episodeCount,
        freeEpisodeCount = freeEpisodeCount,
        coinCostPerEpisode = coinCostPerEpisode,
        ageRating = ageRating,
        likes = likes,
        liked = liked,
    )

fun EpisodeSummaryDto.toDomain(media: MediaUrlResolver): Episode =
    Episode(
        id = id,
        seriesId = seriesId,
        index = number,
        title = title ?: "Épisode $number",
        durationMs = durationSeconds.takeIf { it > 0 }?.let { (it * MS_PER_SECOND).toLong() },
        thumbnailUrl = media.resolve(thumbnailUrl),
        access = access.toEpisodeAccess(),
        coinCost = coinCost,
    )

/** Feed episode (v1.2 reduced shape allowed): the first, free episode of the series. */
fun FeedEpisodeDto.toDomain(
    seriesId: String,
    media: MediaUrlResolver,
): Episode =
    Episode(
        id = id,
        seriesId = this.seriesId ?: seriesId,
        index = number,
        title = title ?: "Épisode $number",
        durationMs = durationSeconds.takeIf { it > 0 }?.let { (it * MS_PER_SECOND).toLong() },
        thumbnailUrl = media.resolve(thumbnailUrl),
        access = access.toEpisodeAccess(),
        coinCost = coinCost,
    )

fun FeedItemDto.toDomain(
    media: MediaUrlResolver,
    nowEpochMs: Long,
): FeedItem {
    val domainSeries = series.toDomain(media).let { s -> if (likes != null) s.copy(likes = likes) else s }
    return FeedItem(
        series = domainSeries,
        episode = episode.toDomain(series.id, media),
        previewUrl = media.resolve(previewUrl),
        previewExpiresAtEpochMs = parseInstantMs(previewExpiresAtIso) ?: (nowEpochMs + DEFAULT_URL_TTL_MS),
        isFavorite = isFavorite ?: series.isFavorite ?: false,
        likes = likes ?: series.likes,
    )
}

/** `UserDto` (v1.2) / `MeDto` / v1 `AuthUserDto`. */
fun AuthUserDto.toDomain(): UserProfile =
    UserProfile(
        id = id,
        isGuest = type.equals("GUEST", ignoreCase = true),
        displayName = displayName?.takeIf { it.isNotBlank() },
        email = email?.takeIf { it.isNotBlank() },
        phone = phone?.takeIf { it.isNotBlank() },
        country = country?.takeIf { it.isNotBlank() }?.uppercase(),
        language = language?.takeIf { it.isNotBlank() }?.lowercase(),
        isVip = isVip || vipStatus.equals("active", ignoreCase = true),
        vipExpiresAtEpochMs = parseInstantMs(vipExpiresAt),
        providers = providers.mapNotNull(AuthProvider::from),
        createdAtEpochMs = parseInstantMs(createdAt),
        deletionScheduledAtEpochMs = parseInstantMs(deletionScheduledAt),
    )

fun String.toEpisodeAccess(): EpisodeAccess =
    when (lowercase()) {
        "free" -> EpisodeAccess.FREE
        "unlocked" -> EpisodeAccess.UNLOCKED
        else -> EpisodeAccess.LOCKED
    }

/** Banner of the configured home; a v1.0 banner (plain series summary) maps with its posters as visual. */
fun HomeBannerDto.toDomain(media: MediaUrlResolver): HomeBanner =
    HomeBanner(
        id = bannerId ?: id,
        seriesId = seriesId ?: id,
        imageUrl = media.resolve(imageUrl ?: posterHorizontalUrl ?: posterVerticalUrl),
        title = bannerTitle?.takeIf { it.isNotBlank() } ?: title,
        subtitle = (bannerSubtitle ?: subtitle)?.takeIf { it.isNotBlank() },
    )

fun HomeRowDto.toDomain(media: MediaUrlResolver): HomeRow =
    HomeRow(
        key = key,
        title = title,
        type = HomeRowType.from(type, key),
        items =
            items.map { item ->
                HomeItem(
                    series = item.series.toDomain(media),
                    episode = item.episode?.toDomain(media),
                    positionMs = item.positionSeconds?.let { (it * MS_PER_SECOND).toLong() },
                )
            },
    )

fun PlaySubtitleDto.toDomain(media: MediaUrlResolver): Subtitle =
    Subtitle(
        language = language.lowercase(),
        url = media.resolve(url) ?: url,
        label = label?.takeIf { it.isNotBlank() } ?: language,
    )

fun PlaySessionDto.toDomain(
    media: MediaUrlResolver,
    nowEpochMs: Long,
): PlaySession {
    val tracks = subtitles.map { it.toDomain(media) }
    return PlaySession(
        episodeId = episodeId,
        seriesId = seriesId,
        episodeNumber = episodeNumber,
        source =
            PlaybackSource(
                url = media.resolve(manifestUrl) ?: manifestUrl,
                format = StreamFormat.HLS,
                drmLicenseUrl = drm.licenseUrl.takeIf { drm.type.equals("widevine", ignoreCase = true) },
                subtitles = tracks,
            ),
        expiresAtEpochMs = parseInstantMs(expiresAt) ?: (nowEpochMs + DEFAULT_URL_TTL_MS),
        resumePositionMs = (resumePositionSeconds * MS_PER_SECOND).toLong().coerceAtLeast(0L),
        durationMs = (durationSeconds * MS_PER_SECOND).toLong().coerceAtLeast(0L),
        nextEpisodeId = nextEpisodeId,
        subtitles = tracks,
    )
}

private const val DEFAULT_URL_TTL_MS = 5 * 60 * 1_000L

fun parseInstantMs(iso: String?): Long? =
    try {
        iso?.let { Instant.parse(it).toEpochMilli() }
    } catch (_: DateTimeParseException) {
        null
    }

// --- domain <-> Room ---

fun Series.toEntity(
    nowEpochMs: Long,
    detail: Boolean,
    previous: SeriesEntity? = null,
): SeriesEntity =
    SeriesEntity(
        id = id,
        slug = slug,
        title = title,
        synopsis = if (detail || synopsis.isNotBlank()) synopsis else previous?.synopsis.orEmpty(),
        posterVerticalUrl = posterVerticalUrl,
        posterHorizontalUrl = posterHorizontalUrl,
        genres = genres.joinToString(","),
        episodeCount = episodeCount,
        freeEpisodeCount = freeEpisodeCount,
        coinCostPerEpisode = coinCostPerEpisode,
        ageRating = ageRating,
        detailFetchedAtEpochMs = if (detail) nowEpochMs else previous?.detailFetchedAtEpochMs,
        fetchedAtEpochMs = nowEpochMs,
        likes = likes ?: previous?.likes,
        liked = liked ?: previous?.liked ?: false,
    )

fun SeriesEntity.toDomain(): Series =
    Series(
        id = id,
        slug = slug,
        title = title,
        synopsis = synopsis,
        posterVerticalUrl = posterVerticalUrl,
        posterHorizontalUrl = posterHorizontalUrl,
        genres = genres.split(',').filter { it.isNotBlank() },
        episodeCount = episodeCount,
        freeEpisodeCount = freeEpisodeCount,
        coinCostPerEpisode = coinCostPerEpisode,
        ageRating = ageRating,
        likes = likes,
        liked = liked,
    )

fun Episode.toEntity(nowEpochMs: Long): EpisodeEntity =
    EpisodeEntity(
        id = id,
        seriesId = seriesId,
        number = index,
        title = title,
        durationMs = durationMs,
        thumbnailUrl = thumbnailUrl,
        access = access.name,
        coinCost = coinCost,
        fetchedAtEpochMs = nowEpochMs,
    )

fun EpisodeEntity.toDomain(): Episode =
    Episode(
        id = id,
        seriesId = seriesId,
        index = number,
        title = title,
        durationMs = durationMs,
        thumbnailUrl = thumbnailUrl,
        access = runCatching { EpisodeAccess.valueOf(access) }.getOrDefault(EpisodeAccess.LOCKED),
        coinCost = coinCost,
    )

fun WatchProgressEntity.toDomain(): WatchProgress =
    WatchProgress(
        episodeId = episodeId,
        seriesId = seriesId,
        positionMs = positionMs,
        durationMs = durationMs,
        completed = completed,
    )

fun WatchHistoryEntity.toDomain(): WatchHistoryEntry =
    WatchHistoryEntry(
        seriesId = seriesId,
        episodeId = episodeId,
        episodeIndex = episodeIndex,
        positionMs = positionMs,
        lastWatchedAtEpochMs = lastWatchedAtEpochMs,
    )
