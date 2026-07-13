package dev.w3ctech.infralab

import dev.w3ctech.infralab.data.contracts.AuthErrorCode
import dev.w3ctech.infralab.data.contracts.DeviceDTO
import dev.w3ctech.infralab.data.contracts.LoginEventsResponse
import dev.w3ctech.infralab.data.contracts.Platform
import dev.w3ctech.infralab.data.contracts.RequestOtpRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Guards the tolerant decode of the two strict enums in the auth contract mirror. A `platform`
 * (or error `code`) the server ships ahead of this client must decode to a sentinel instead of
 * throwing `SerializationException` — otherwise a single unknown row fails an entire
 * devices / login-events / error response (the #194 class of bug).
 */
class ContractsSerializationTest {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    @Test
    fun `known platform round-trips through its wire name`() {
        val decoded = json.decodeFromString<DeviceDTO>(
            """{"id":"d1","platform":"android","deviceId":"x","lastSeenAt":"t","createdAt":"t"}""",
        )
        assertEquals(Platform.ANDROID, decoded.platform)
    }

    @Test
    fun `newly mirrored platforms decode instead of crashing the list (the #194 bug)`() {
        // Before the fix these strict-enum values threw SerializationException, failing the whole
        // devices / login-events response. They are now first-class enum members.
        assertEquals(Platform.CLI, Platform.fromWire("cli"))
        assertEquals(Platform.WEAPP, Platform.fromWire("weapp"))
        assertEquals(Platform.MACOS, Platform.fromWire("macos"))
    }

    @Test
    fun `an unmodelled platform decodes to UNKNOWN instead of throwing`() {
        val decoded = json.decodeFromString<DeviceDTO>(
            """{"id":"d1","platform":"playstation","deviceId":"x","lastSeenAt":"t","createdAt":"t"}""",
        )
        assertEquals(Platform.UNKNOWN, decoded.platform)
    }

    @Test
    fun `a login-events list survives an unmodelled platform row`() {
        val body = """
            {"ok":true,"events":[
              {"id":"e1","platform":"ios","success":true,"createdAt":"t"},
              {"id":"e2","platform":"future-os","success":false,"createdAt":"t"}
            ]}
        """.trimIndent()
        val decoded = json.decodeFromString<LoginEventsResponse>(body)
        assertEquals(2, decoded.events.size)
        assertEquals(Platform.IOS, decoded.events[0].platform)
        assertEquals(Platform.UNKNOWN, decoded.events[1].platform)
    }

    @Test
    fun `client encodes its own platform as the lowercase wire name`() {
        val encoded = json.encodeToString(RequestOtpRequest("+8613800138000", Platform.ANDROID))
        assertEquals("""{"phone":"+8613800138000","platform":"android"}""", encoded)
    }

    @Test
    fun `newly mirrored error codes decode by name`() {
        assertEquals(AuthErrorCode.LAST_CREDENTIAL, AuthErrorCode.fromWire("LAST_CREDENTIAL"))
        assertEquals(
            AuthErrorCode.PHONE_ALREADY_LINKED,
            AuthErrorCode.fromWire("PHONE_ALREADY_LINKED"),
        )
    }

    @Test
    fun `unknown error code decodes to UNKNOWN instead of throwing`() {
        assertEquals(AuthErrorCode.UNKNOWN, AuthErrorCode.fromWire("SOME_FUTURE_CODE"))
    }
}
