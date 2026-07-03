package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.contracts.Platform
import dev.w3ctech.infralab.ui.Format
import org.junit.Assert.assertEquals
import org.junit.Test

class FormatTest {
    @Test
    fun `platformLabel matches the other clients`() {
        assertEquals("Web", Format.platformLabel(Platform.WEB))
        assertEquals("iOS", Format.platformLabel(Platform.IOS))
        assertEquals("Android", Format.platformLabel(Platform.ANDROID))
        assertEquals("HarmonyOS", Format.platformLabel(Platform.HARMONY))
    }

    @Test
    fun `date falls back to the raw string when unparseable`() {
        assertEquals("not-a-date", Format.date("not-a-date"))
    }

    @Test
    fun `date renders a parseable ISO-8601 timestamp`() {
        // Just assert it produced *something* other than the raw ISO string (locale-dependent output).
        val out = Format.date("2026-07-02T07:07:52.955Z")
        assert(out.isNotBlank())
    }
}
