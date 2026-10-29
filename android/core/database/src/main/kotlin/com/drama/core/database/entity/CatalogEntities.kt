package com.drama.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Cached series (summary from /home or /series, detail fields filled by /series/{id}). */
@Entity(tableName = "series")
data class SeriesEntity(
    @PrimaryKey val id: String,
    val slug: String,
    val title: String,
    val synopsis: String,
    val posterVerticalUrl: String?,
    val posterHorizontalUrl: String?,
    /** Comma-separated; genres never contain commas (slugs). */
    val genres: String,
    val episodeCount: Int,
    val freeEpisodeCount: Int,
    val coinCostPerEpisode: Int,
    val ageRating: String,
    /** Null until `GET /series/{id}` has been fetched (synopsis is then reliable). */
    val detailFetchedAtEpochMs: Long?,
    val fetchedAtEpochMs: Long,
)

@Entity(
    tableName = "episodes",
    indices = [Index(value = ["seriesId", "number"])],
)
data class EpisodeEntity(
    @PrimaryKey val id: String,
    val seriesId: String,
    val number: Int,
    val title: String,
    val durationMs: Long?,
    val thumbnailUrl: String?,
    /** `FREE` | `UNLOCKED` | `LOCKED` as seen by the viewer who fetched it. */
    val access: String,
    val coinCost: Int,
    val fetchedAtEpochMs: Long,
)

@Entity(tableName = "home_rows")
data class HomeRowEntity(
    @PrimaryKey val key: String,
    val position: Int,
    val title: String,
)

@Entity(
    tableName = "home_row_items",
    primaryKeys = ["rowKey", "position"],
    indices = [Index(value = ["seriesId"])],
)
data class HomeRowItemEntity(
    val rowKey: String,
    val position: Int,
    val seriesId: String,
    val episodeId: String?,
    val positionMs: Long?,
)

/** Last successful fetch per cache key (`home`, `series:<id>`, `episodes:<id>`): drives stale-while-revalidate. */
@Entity(tableName = "cache_meta")
data class CacheMetaEntity(
    @PrimaryKey val key: String,
    val fetchedAtEpochMs: Long,
)
