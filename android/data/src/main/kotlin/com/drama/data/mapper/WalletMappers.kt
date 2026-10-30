package com.drama.data.mapper

import com.drama.core.network.dto.CoinPackDto
import com.drama.core.network.dto.LedgerEntryDto
import com.drama.core.network.dto.LedgerPageDto
import com.drama.core.network.dto.PriceDto
import com.drama.core.network.dto.ShopDto
import com.drama.core.network.dto.SubscriptionDto
import com.drama.core.network.dto.UnlockResponseDto
import com.drama.core.network.dto.VerifyPurchaseResponseDto
import com.drama.core.network.dto.VipPlanDto
import com.drama.core.network.dto.WalletDto
import com.drama.domain.model.BonusExpiry
import com.drama.domain.model.CoinPack
import com.drama.domain.model.LedgerBucket
import com.drama.domain.model.LedgerEntry
import com.drama.domain.model.LedgerPage
import com.drama.domain.model.LedgerType
import com.drama.domain.model.Price
import com.drama.domain.model.PurchaseVerification
import com.drama.domain.model.PurchaseVerificationStatus
import com.drama.domain.model.ShopCatalog
import com.drama.domain.model.Subscription
import com.drama.domain.model.SubscriptionStatus
import com.drama.domain.model.UnlockMethod
import com.drama.domain.model.UnlockResult
import com.drama.domain.model.VipPeriod
import com.drama.domain.model.VipPlan
import com.drama.domain.model.Wallet
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

fun WalletDto.toDomain(): Wallet =
    Wallet(
        purchased = purchased,
        bonus = bonus,
        total = total,
        autoUnlock = autoUnlock,
        bonusExpiring =
            bonusExpiring.mapNotNull { b ->
                parseInstantMs(b.expiresAt)?.let { BonusExpiry(b.amount, it) }
            },
    )

fun LedgerEntryDto.toDomain(): LedgerEntry =
    LedgerEntry(
        id = id,
        amount = amount,
        bucket = LedgerBucket.from(bucket),
        type = LedgerType.from(type),
        reference = reference?.toReferenceString(),
        description = description?.takeIf { it.isNotBlank() },
        expiresAtEpochMs = parseInstantMs(expiresAt),
        createdAtEpochMs = parseInstantMs(createdAt),
    )

/** `{type, id}` -> `type:id`; a primitive is taken as is. */
private fun JsonElement.toReferenceString(): String? =
    when (this) {
        is JsonPrimitive -> contentOrNull
        is JsonObject -> {
            val type = (this["type"] as? JsonPrimitive)?.contentOrNull
            val id = (this["id"] as? JsonPrimitive)?.contentOrNull
            listOfNotNull(type, id).joinToString(":").takeIf { it.isNotBlank() }
        }
        else -> null
    }

fun LedgerPageDto.toDomain(fallbackPageSize: Int): LedgerPage =
    LedgerPage(
        items = items.map { it.toDomain() },
        total = total,
        page = page,
        pageSize = pageSize.takeIf { it > 0 } ?: fallbackPageSize,
    )

/** [requestedEpisodeId] fills the id when the server omits it (OpenAPI draft shape). */
fun UnlockResponseDto.toDomain(requestedEpisodeId: String): UnlockResult {
    val charged = charged
    val debited = coinsDebited ?: 0
    return UnlockResult(
        episodeId = episodeId ?: requestedEpisodeId,
        method = UnlockMethod.from(method),
        chargedBonus = charged?.bonus ?: 0,
        chargedPurchased = charged?.purchased ?: if (charged == null) debited else 0,
        wallet = wallet?.toDomain(),
    )
}

fun PriceDto.toDomain(): Price = Price(currency = currency.uppercase(), amountMinor = amountMinor)

fun CoinPackDto.toDomain(): CoinPack =
    CoinPack(
        id = id,
        sku = sku,
        coins = coins,
        bonusCoins = bonusCoins,
        price = price.toDomain(),
        badge = badge?.takeIf { it.isNotBlank() },
        position = position,
    )

fun VipPlanDto.toDomain(): VipPlan =
    VipPlan(
        id = id,
        sku = sku,
        period = VipPeriod.from(period),
        price = price.toDomain(),
        trialDays = trialDays,
        badge = badge?.takeIf { it.isNotBlank() },
    )

fun ShopDto.toDomain(): ShopCatalog =
    ShopCatalog(
        currency = currency.uppercase(),
        coinPacks = coinPacks.map { it.toDomain() }.sortedBy { it.position },
        vipPlans = vipPlans.map { it.toDomain() },
    )

fun VerifyPurchaseResponseDto.toDomain(): PurchaseVerification =
    PurchaseVerification(
        status = PurchaseVerificationStatus.from(status) ?: PurchaseVerificationStatus.CREDITED,
        wallet = wallet?.toDomain(),
        vipActive = vip?.active ?: vip?.status?.let { it.equals("active", ignoreCase = true) },
    )

fun SubscriptionDto.toDomain(): Subscription =
    Subscription(
        status = SubscriptionStatus.from(status),
        planSku = plan,
        startedAtEpochMs = parseInstantMs(startedAt),
        expiresAtEpochMs = parseInstantMs(expiresAt),
        autoRenew = autoRenew,
        store = store,
    )
