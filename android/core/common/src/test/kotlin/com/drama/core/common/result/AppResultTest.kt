package com.drama.core.common.result

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppResultTest {
    @Test
    fun `map transforms success value`() {
        val result: AppResult<Int> = AppResult.Success(2)
        assertEquals(AppResult.Success(4), result.map { it * 2 })
    }

    @Test
    fun `runCatchingResult wraps exceptions into Unknown`() {
        val result = runCatchingResult<Int> { error("boom") }
        assertTrue(result is AppResult.Failure)
        assertTrue((result as AppResult.Failure).error is AppError.Unknown)
    }
}
