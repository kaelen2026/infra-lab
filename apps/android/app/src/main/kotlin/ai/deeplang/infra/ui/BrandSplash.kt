package ai.deeplang.infra.ui

import ai.deeplang.infra.R
import ai.deeplang.infra.ui.auth.AuthCopyGenerated
import ai.deeplang.infra.ui.theme.InfraTheme
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Entrance timing / geometry for the in-app brand splash. The system SplashScreen can
// only show an icon, so this Compose screen carries the wordmark + tagline as well.
private const val ENTER_DURATION_MS = 500
private const val ENTER_START_SCALE = 0.92f
private val ICON_SIZE = 108.dp
private val ICON_CORNER = 26.dp

/**
 * Full-screen brand splash: the clay OTP-bubble mark over the icon's clay background,
 * the wordmark, and the tagline — all on the design-token background. Purely
 * presentational; entrance (alpha + scale) is self-contained, and the caller owns when
 * it appears / fades out.
 */
@Composable
fun BrandSplash(modifier: Modifier = Modifier) {
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { started = true }

    val alpha by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = tween(durationMillis = ENTER_DURATION_MS),
        label = "brandSplashAlpha",
    )
    val scale by animateFloatAsState(
        targetValue = if (started) 1f else ENTER_START_SCALE,
        animationSpec = tween(durationMillis = ENTER_DURATION_MS),
        label = "brandSplashScale",
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .alpha(alpha)
                .scale(scale)
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // The launcher foreground fills (light bubble + clay ink) are drawn against
            // the fixed clay icon background, so reuse that generated color here — the
            // mark then reads identically to the home-screen icon in light and dark.
            Box(
                modifier = Modifier
                    .size(ICON_SIZE)
                    .clip(RoundedCornerShape(ICON_CORNER))
                    .background(colorResource(R.color.ic_launcher_background)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.ic_launcher_foreground),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = AuthCopyGenerated.BRAND.uppercase(),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 4.sp,
                textAlign = TextAlign.Center,
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = AuthCopyGenerated.TAGLINE,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 15.sp,
                letterSpacing = 1.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun BrandSplashPreviewLight() {
    InfraTheme(darkTheme = false) { BrandSplash() }
}

@Preview(showBackground = true)
@Composable
private fun BrandSplashPreviewDark() {
    InfraTheme(darkTheme = true) { BrandSplash() }
}
