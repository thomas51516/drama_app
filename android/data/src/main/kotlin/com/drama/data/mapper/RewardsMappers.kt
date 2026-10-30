package com.drama.data.mapper

import com.drama.core.network.dto.AdEligibilityDto
import com.drama.core.network.dto.AdSessionDto
import com.drama.core.network.dto.AdSessionStatusDto
import com.drama.core.network.dto.CheckInResultDto
import com.drama.core.network.dto.CheckInStatusDto
import com.drama.core.network.dto.ClaimTaskResultDto
import com.drama.core.network.dto.GenresDto
import com.drama.core.network.dto.LimitedOfferDto
import com.drama.core.network.dto.OffersDto
import com.drama.core.network.dto.PromoRedeemResponseDto
import com.drama.core.network.dto.RankingsDto
import com.drama.core.network.dto.RewardTaskDto
import com.drama.core.network.dto.UnlockAllQuoteDto
import com.drama.core.network.dto.UnlockAllResponseDto
import com.drama.core.network.dto.WelcomeOfferDto
import com.drama.data.media.MediaUrlResolver
import com.drama.domain.model.AdEligibility
import com.drama.domain.model.AdIneligibleReason
import com.drama.domain.model.AdSession
import com.drama.domain.model.AdSessionState
import com.drama.domain.model.AdSessionStatus
import com.drama.domain.model.CheckInResult
import com.drama.domain.model.CheckInStatus
import com.drama.domain.model.Genre
import com.drama.domain.model.GenreLabels
import com.drama.domain.model.LimitedOffer
import com.drama.domain.model.Offers
import com.drama.domain.model.PromoRedemption
import com.drama.domain.model.RankingItem
import com.drama.domain.model.RankingPeriod
import com.drama.domain.model.Rankings
import com.drama.domain.model.RewardTask
import com.drama.domain.model.RewardTaskStatus
import com.drama.domain.model.TaskClaimResult
import com.drama.domain.model.UnlockAllQuote
import com.drama.domain.model.UnlockAllResult
import com.drama.domain.model.WelcomeOffer

fun CheckInStatusDto.toDomain(): CheckInStatus =
    CheckInStatus(
        scale = scale.ifEmpty { DEFAULT_SCALE },
        streakDay = streakDay.coerceIn(0, CheckInStatus.WEEK_LENGTH),
        claimedToday = claimedToday,
        nextClaimAtEpochMs = parseInstantMs(nextClaimAt),
        resetOnMiss = resetOnMiss,
    )

fun CheckInResultDto.toDomain(): CheckInResult = CheckInResult(day = day, coins = coins, wallet = wallet?.toDomain())

fun RewardTaskDto.toDomain(): RewardTask =
    RewardTask(
        id = id,
        key = key.ifBlank { id },
        title = title.ifBlank { key.ifBlank { id } },
        description = description?.takeIf { it.isNotBlank() },
        coins = coins,
        target = target,
        progress = progress.coerceAtLeast(0),
        status = RewardTaskStatus.from(status),
        expiresAtEpochMs = parseInstantMs(expiresAt),
    )

fun ClaimTaskResultDto.toDomain(): TaskClaimResult = TaskClaimResult(coins = coins, wallet = wallet?.toDomain())

fun AdEligibilityDto.toDomain(): AdEligibility =
    AdEligibility(
        eligible = eligible,
        remainingToday = remainingToday,
        dailyCap = dailyCap,
        reason = AdIneligibleReason.from(reason),
        adUnitId = adUnitId?.takeIf { it.isNotBlank() },
        provider = provider?.takeIf { it.isNotBlank() },
    )

fun AdSessionDto.toDomain(): AdSession =
    AdSession(sessionId = sessionId, customData = customData, expiresAtEpochMs = parseInstantMs(expiresAt))

fun AdSessionStatusDto.toDomain(): AdSessionStatus =
    AdSessionStatus(state = AdSessionState.from(status), unlocked = unlocked)

fun UnlockAllQuoteDto.toDomain(): UnlockAllQuote =
    UnlockAllQuote(lockedCount = lockedCount, fullPrice = fullPrice, discountPercent = discountPercent, price = price)

fun UnlockAllResponseDto.toDomain(): UnlockAllResult =
    UnlockAllResult(unlockedEpisodeIds = unlockedEpisodeIds, charged = charged, wallet = wallet?.toDomain())

fun WelcomeOfferDto.toDomain(): WelcomeOffer =
    WelcomeOffer(
        packSku = packSku?.takeIf { it.isNotBlank() },
        bonusPercent = bonusPercent,
        expiresAtEpochMs = parseInstantMs(expiresAt),
    )

fun LimitedOfferDto.toDomain(): LimitedOffer =
    LimitedOffer(
        id = id,
        title = title?.takeIf { it.isNotBlank() },
        packSku = packSku,
        bonusPercent = bonusPercent,
        endsAtEpochMs = parseInstantMs(endsAt),
    )

fun OffersDto.toDomain(): Offers = Offers(welcome = welcome?.toDomain(), limited = limited.map { it.toDomain() })

fun PromoRedeemResponseDto.toDomain(): PromoRedemption = PromoRedemption(coins = coins, wallet = wallet?.toDomain())

fun RankingsDto.toDomain(
    media: MediaUrlResolver,
    requestedGenre: String?,
): Rankings =
    Rankings(
        period = RankingPeriod.from(period),
        genre = genre ?: requestedGenre,
        items =
            items.mapIndexed { index, item ->
                RankingItem(
                    rank = item.rank.takeIf { it > 0 } ?: (index + 1),
                    series = item.series.toDomain(media),
                    viewers = item.viewers,
                )
            },
    )

fun GenresDto.toDomain(): GenreLabels =
    GenreLabels.of(
        items
            .filter {
                it.key.isNotBlank()
            }.map { Genre(it.key, it.label.ifBlank { GenreLabels.fallback(it.key) }) },
    )

/** Contract v1.5 default scale, used when the server sends none. */
private val DEFAULT_SCALE = listOf(5, 5, 10, 10, 15, 15, 30)
