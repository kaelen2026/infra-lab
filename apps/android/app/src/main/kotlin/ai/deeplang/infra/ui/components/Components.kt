package ai.deeplang.infra.ui.components

import ai.deeplang.infra.ui.theme.DesignTokens
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

/** Rounded, outlined surface card — the shared container for account/todo sections. */
@Composable
fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(DesignTokens.radius))
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(DesignTokens.radius))
            .padding(20.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(12.dp))
        content()
    }
}

/** A label on the left, an arbitrary value composable on the right. */
@Composable
fun KeyValueRow(label: String, value: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        value()
    }
}

enum class BadgeStyle { NEUTRAL, SUCCESS, DESTRUCTIVE }

/** Small pill label used for platform / status tags. */
@Composable
fun Badge(text: String, style: BadgeStyle = BadgeStyle.NEUTRAL) {
    val container = when (style) {
        BadgeStyle.NEUTRAL -> MaterialTheme.colorScheme.surfaceVariant
        BadgeStyle.SUCCESS -> MaterialTheme.colorScheme.primary
        BadgeStyle.DESTRUCTIVE -> MaterialTheme.colorScheme.error
    }
    val content = when (style) {
        BadgeStyle.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
        BadgeStyle.SUCCESS -> MaterialTheme.colorScheme.onPrimary
        BadgeStyle.DESTRUCTIVE -> MaterialTheme.colorScheme.onError
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = content,
        modifier = Modifier
            .background(container, RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

/** Monospace text — for phone numbers, IPs and timestamps. */
@Composable
fun MonoText(text: String, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
        color = color,
    )
}

/** A shimmer-less placeholder bar shown while data loads. */
@Composable
fun SkeletonBar(widthFraction: Float = 1f, height: Int = 28) {
    Box(
        modifier = Modifier
            .fillMaxWidth(widthFraction)
            .height(height.dp)
            .background(
                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f),
                RoundedCornerShape(6.dp),
            ),
    )
}

/** Inline error banner; renders nothing when [message] is null. */
@Composable
fun ErrorBanner(message: String?) {
    if (message == null) return
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.fillMaxWidth(),
    )
}
