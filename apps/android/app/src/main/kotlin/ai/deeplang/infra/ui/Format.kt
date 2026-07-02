package ai.deeplang.infra.ui

import ai.deeplang.infra.data.contracts.Platform
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Presentation helpers shared by the account and todo screens — the Kotlin counterpart of web's
 * `lib/format.ts` and iOS's `Format`. Pure and Android-framework-free so it stays unit-testable.
 */
object Format {
    private val dateFormatter: DateTimeFormatter =
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
    private val dateTimeFormatter: DateTimeFormatter =
        DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)

    /** Human platform label matching the other clients (web / iOS / Android / HarmonyOS). */
    fun platformLabel(platform: Platform): String = when (platform) {
        Platform.WEB -> "Web"
        Platform.IOS -> "iOS"
        Platform.ANDROID -> "Android"
        Platform.HARMONY -> "HarmonyOS"
    }

    /** Format an ISO-8601 timestamp as a local date; falls back to the raw string if unparseable. */
    fun date(iso: String): String = render(iso, dateFormatter)

    /** Format an ISO-8601 timestamp as a local date + time. */
    fun dateTime(iso: String): String = render(iso, dateTimeFormatter)

    private fun render(iso: String, formatter: DateTimeFormatter): String =
        runCatching {
            OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault()).format(formatter)
        }.getOrDefault(iso)
}
