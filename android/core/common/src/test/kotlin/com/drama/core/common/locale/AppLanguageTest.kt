package com.drama.core.common.locale

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLanguageTest {
    @Test
    fun `plain codes map to the four supported languages`() {
        assertEquals(AppLanguage.FRENCH, AppLanguage.fromTag("fr"))
        assertEquals(AppLanguage.ENGLISH, AppLanguage.fromTag("en"))
        assertEquals(AppLanguage.SPANISH, AppLanguage.fromTag("es"))
        assertEquals(AppLanguage.PORTUGUESE, AppLanguage.fromTag("pt"))
    }

    @Test
    fun `regional tags and odd casing are reduced to the language`() {
        assertEquals(AppLanguage.PORTUGUESE, AppLanguage.fromTag("pt-BR"))
        assertEquals(AppLanguage.SPANISH, AppLanguage.fromTag("es_419"))
        assertEquals(AppLanguage.ENGLISH, AppLanguage.fromTag(" EN-us "))
        assertEquals(AppLanguage.FRENCH, AppLanguage.fromTag("fr-CI"))
    }

    @Test
    fun `unsupported or empty tags fall back to french`() {
        assertNull(AppLanguage.fromTag("de"))
        assertNull(AppLanguage.fromTag(""))
        assertNull(AppLanguage.fromTag(null))
        assertEquals(AppLanguage.FRENCH, AppLanguage.fromTagOrDefault("yo-NG"))
        assertEquals(AppLanguage.FRENCH, AppLanguage.fromTagOrDefault(null))
    }
}
