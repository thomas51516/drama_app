package com.drama.core.billing

import com.drama.core.common.logging.NoOpLogger
import com.drama.core.common.result.AppResult
import com.drama.core.network.ApiErrorMapper
import com.drama.core.network.api.ShopApi
import com.drama.data.repository.DefaultShopRepository
import com.drama.data.wallet.WalletStore
import com.drama.domain.model.BillingProductType
import com.drama.domain.model.BillingPromptAnswer
import com.drama.domain.model.BillingUiHost
import com.drama.domain.model.PurchaseVerificationStatus
import com.drama.domain.usecase.DefaultPurchaseProductUseCase
import com.drama.domain.usecase.DefaultRestorePurchasesUseCase
import com.drama.domain.usecase.PurchaseResult
import com.drama.domain.usecase.VerifyPurchase
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Simulated store -> `POST /billing/google/verify` -> consume (S07-A2-03). The MockWebServer plays the backend
 * with its fake verifier: tokens `fake:<sku>:<nonce>` are credited once, then `already_processed`.
 */
class PurchaseFlowTest {
    private val server = MockWebServer()
    private val json = Json { ignoreUnknownKeys = true }
    private val billing = FakeBillingGateway(NoOpLogger)
    private val walletStore = WalletStore()
    private val verifyRequests = mutableListOf<String>()
    private val creditedTokens = mutableSetOf<String>()
    private var verifyStatus = 200
    private lateinit var purchase: DefaultPurchaseProductUseCase
    private lateinit var restore: DefaultRestorePurchasesUseCase
    private val host = object : BillingUiHost {}

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    if (request.url.encodedPath != "/billing/google/verify") return MockResponse(code = 404)
                    val body = request.body?.utf8().orEmpty()
                    verifyRequests += body
                    if (verifyStatus !=
                        200
                    ) {
                        return MockResponse(
                            code = verifyStatus,
                            body = """{"statusCode":$verifyStatus,"code":"X"}""",
                        )
                    }
                    val token =
                        json
                            .parseToJsonElement(body)
                            .jsonObject["purchaseToken"]!!
                            .jsonPrimitive.content
                    if (!token.startsWith(
                            "fake:",
                        )
                    ) {
                        return MockResponse(code = 400, body = """{"statusCode":400,"code":"PURCHASE_INVALID"}""")
                    }
                    val status = if (creditedTokens.add(token)) "credited" else "already_processed"
                    val wallet = """{"purchased":110,"bonus":10,"total":120,"autoUnlock":false}"""
                    return MockResponse(code = 200, body = """{"status":"$status","wallet":$wallet}""")
                }
            }
        server.start()
        val api =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(ShopApi::class.java)
        val shop = DefaultShopRepository(api, walletStore, ApiErrorMapper(json), NoOpLogger)
        val verify = VerifyPurchase(billing, shop)
        purchase = DefaultPurchaseProductUseCase(billing, verify)
        restore = DefaultRestorePurchasesUseCase(billing, verify)
    }

    @After
    fun tearDown() = server.close()

    @Test
    fun `successful simulated purchase is verified with a fake token, credited, then consumed`() =
        runTest {
            val pending = async { purchase(host, "coins_100", BillingProductType.INAPP) }
            val prompt = billing.prompt.first { it != null }
            assertEquals("coins_100", prompt?.sku)
            billing.answerPrompt(BillingPromptAnswer.SUCCESS)
            val result = pending.await() as PurchaseResult.Credited

            assertTrue(result.isNew)
            assertEquals(PurchaseVerificationStatus.CREDITED, result.verification.status)
            assertEquals(120, walletStore.wallet.value?.total)
            val body = json.parseToJsonElement(verifyRequests.single()).jsonObject
            assertTrue(body["purchaseToken"]!!.jsonPrimitive.content.startsWith("fake:coins_100:"))
            assertEquals("coins_100", body["productId"]!!.jsonPrimitive.content)
            assertEquals("inapp", body["type"]!!.jsonPrimitive.content)
            assertEquals(
                VerifyPurchase.idempotencyKeyFor(result.purchase.token),
                body["idempotencyKey"]!!.jsonPrimitive.content,
            )
            // Consumed: the store holds nothing any more.
            assertTrue((billing.queryPurchases(BillingProductType.INAPP) as AppResult.Success).value.isEmpty())
            assertNull(billing.prompt.value)
        }

    @Test
    fun `cancel yields Cancelled and nothing is sent to the backend`() =
        runTest {
            val pending = async { purchase(host, "coins_100", BillingProductType.INAPP) }
            billing.prompt.first { it != null }
            billing.answerPrompt(BillingPromptAnswer.CANCEL)
            assertEquals(PurchaseResult.Cancelled, pending.await())
            assertTrue(verifyRequests.isEmpty())
        }

    @Test
    fun `verification failure keeps the purchase unconsumed and a restore credits it with the same key`() =
        runTest {
            verifyStatus = 503
            val pending = async { purchase(host, "coins_500", BillingProductType.INAPP) }
            billing.prompt.first { it != null }
            billing.answerPrompt(BillingPromptAnswer.SUCCESS)
            val failed = pending.await()
            assertTrue(failed is PurchaseResult.VerificationFailed)
            assertEquals(1, (billing.queryPurchases(BillingProductType.INAPP) as AppResult.Success).value.size)

            verifyStatus = 200
            val restored = (restore() as AppResult.Success).value
            assertEquals(1, restored.size)
            assertTrue(restored.single().isNew)
            val firstKey =
                json
                    .parseToJsonElement(
                        verifyRequests[0],
                    ).jsonObject["idempotencyKey"]!!
                    .jsonPrimitive.content
            val secondKey =
                json
                    .parseToJsonElement(
                        verifyRequests[1],
                    ).jsonObject["idempotencyKey"]!!
                    .jsonPrimitive.content
            assertEquals(firstKey, secondKey)
            assertTrue((billing.queryPurchases(BillingProductType.INAPP) as AppResult.Success).value.isEmpty())
        }

    @Test
    fun `pending purchase is not verified until the store settles it, then credited once`() =
        runTest {
            val pending = async { purchase(host, "coins_100", BillingProductType.INAPP) }
            billing.prompt.first { it != null }
            billing.answerPrompt(BillingPromptAnswer.PENDING)
            assertTrue(pending.await() is PurchaseResult.Pending)
            assertTrue(verifyRequests.isEmpty())

            val first = (restore() as AppResult.Success).value
            assertEquals(1, first.size)
            assertTrue(first.single().isNew)

            // Already credited server-side and consumed locally: a second restore finds nothing.
            val second = (restore() as AppResult.Success).value
            assertTrue(second.isEmpty())
            assertEquals(1, verifyRequests.size)
        }

    @Test
    fun `already processed answer is a silent success`() =
        runTest {
            creditedTokens += "seed" // not used, documents the server behaviour
            val pending = async { purchase(host, "coins_100", BillingProductType.INAPP) }
            billing.prompt.first { it != null }
            billing.answerPrompt(BillingPromptAnswer.SUCCESS)
            val first = pending.await() as PurchaseResult.Credited
            // Replay the same token through the verifier (what a double restore would do).
            val verify =
                VerifyPurchase(
                    billing,
                    DefaultShopRepository(
                        Retrofit
                            .Builder()
                            .baseUrl(server.url("/"))
                            .client(OkHttpClient())
                            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                            .build()
                            .create(ShopApi::class.java),
                        walletStore,
                        ApiErrorMapper(json),
                        NoOpLogger,
                    ),
                )
            val again = verify(first.purchase) as PurchaseResult.Credited
            assertFalse(again.isNew)
            assertEquals(PurchaseVerificationStatus.ALREADY_PROCESSED, again.verification.status)
        }
}
