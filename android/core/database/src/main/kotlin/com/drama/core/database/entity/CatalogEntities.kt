package com.drama.core.database.entity

import androidx.room.ColumnInfo
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
    /** "J'aime" count (v4, contract v1.2); null when the server never sent it. */
    val likes: Int? = null,
    /** Whether this viewer liked the series (v4); flipped optimistically by the toggle. */
    @ColumnInfo(defaultValue = "0") val liked: Boolean = false,
)

/** "Ma liste" membership (v4, M-16). The series itself lives in `series`; [position] keeps the server order. */
@Entity(
    tableName = "favorites",
    indices = [Index(value = ["position"])],
)
data class FavoriteEntity(
    @PrimaryKey val seriesId: String,
    val position: Int,
    val addedAtEpochMs: Long,
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
    /** `HomeRowType` name (v3); rows cached by v2 read back as MANUAL and are re-typed from their key. */
    @ColumnInfo(defaultValue = "MANUAL") val type: String = "MANUAL",
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

/** Configured banners of `GET /home` (addendum v1.1, schema v3). */
@Entity(tableName = "home_banners")
data class HomeBannerEntity(
    @PrimaryKey val id: String,
    val position: Int,
    val seriesId: String,
    val imageUrl: String?,
    val title: String,
    val subtitle: String?,
)

/** Last successful fetch per cache key (`home`, `series:<id>`, `episodes:<id>`): drives stale-while-revalidate. */
@Entity(tableName = "cache_meta")
data class CacheMetaEntity(
    @PrimaryKey val key: String,
    val fetchedAtEpochMs: Long,
)
