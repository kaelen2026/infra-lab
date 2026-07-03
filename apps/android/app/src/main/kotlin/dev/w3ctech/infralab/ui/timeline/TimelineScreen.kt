package dev.w3ctech.infralab.ui.timeline

import dev.w3ctech.infralab.BuildConfig
import dev.w3ctech.infralab.data.contracts.TimelineImageContentType
import dev.w3ctech.infralab.data.contracts.TimelineLimits
import dev.w3ctech.infralab.data.contracts.TimelinePostDTO
import dev.w3ctech.infralab.ui.Format
import dev.w3ctech.infralab.ui.components.ErrorBanner
import dev.w3ctech.infralab.ui.components.MonoText
import dev.w3ctech.infralab.ui.components.SectionCard
import dev.w3ctech.infralab.ui.components.SkeletonBar
import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer

/**
 * The timeline feed — the Android counterpart of iOS's `TimelineView`: a composer (text + image
 * picker) above the user's newest-first posts, with infinite scroll for older pages. Loaded once on
 * first composition. Rides the shared authenticated transport, so the Bearer header and 401-refresh
 * apply transparently.
 */
@Composable
fun TimelineScreen(
    viewModel: TimelineViewModel = viewModel(factory = TimelineViewModel.Factory),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.load() }

    LazyColumn(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(vertical = 20.dp),
    ) {
        item(key = "header") {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("动态", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "分享此刻:带文字与图片的个人时间线,仅你可见的私有动态流。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item(key = "composer") {
            Composer(busy = state.publishing, onPublish = viewModel::publish)
        }

        when {
            state.loading -> item(key = "skeleton") { FeedSkeleton() }
            state.posts.isNullOrEmpty() -> item(key = "empty") { EmptyState() }
            else -> {
                val posts = state.posts.orEmpty()
                items(posts, key = { it.id }) { post ->
                    PostCard(
                        post = post,
                        pending = state.pendingIds.contains(post.id),
                        onRemove = { viewModel.remove(post.id) },
                    )
                }
                if (state.hasMore) {
                    item(key = "footer") {
                        // Materializing the footer means the user scrolled to the end — page in more.
                        LaunchedEffect(state.nextCursor) { viewModel.loadMore() }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 16.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                        }
                    }
                }
            }
        }

        item(key = "error") { ErrorBanner(state.error) }
    }
}

@Composable
private fun Composer(
    busy: Boolean,
    onPublish: (String, List<PickedImage>, (Boolean) -> Unit) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var images by remember { mutableStateOf<List<PickedImage>>(emptyList()) }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(TimelineLimits.MAX_IMAGES),
    ) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            val picked = withContext(Dispatchers.IO) { readPickedImages(context, uris) }
            images = (images + picked).take(TimelineLimits.MAX_IMAGES)
        }
    }

    val canPublish = (text.trim().isNotEmpty() || images.isNotEmpty()) && !busy
    val canAddMore = images.size < TimelineLimits.MAX_IMAGES && !busy

    SectionCard(title = "发布动态") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = text,
                onValueChange = { if (it.length <= TimelineLimits.MAX_TEXT_LENGTH) text = it },
                placeholder = { Text("分享此刻…") },
                enabled = !busy,
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )

            if (images.isNotEmpty()) {
                SelectedImages(images = images, enabled = !busy, onRemove = { idx ->
                    images = images.filterIndexed { i, _ -> i != idx }
                })
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = {
                        picker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    enabled = canAddMore,
                ) {
                    Text("添加图片 (${images.size}/${TimelineLimits.MAX_IMAGES})")
                }
                TextButton(
                    onClick = {
                        onPublish(text, images) { published ->
                            if (published) {
                                text = ""
                                images = emptyList()
                            }
                        }
                    },
                    enabled = canPublish,
                ) {
                    if (busy) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("发布")
                    }
                }
            }
        }
    }
}

@Composable
private fun SelectedImages(
    images: List<PickedImage>,
    enabled: Boolean,
    onRemove: (Int) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        images.forEachIndexed { index, image ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AsyncImage(
                    model = ByteBuffer.wrap(image.bytes),
                    contentDescription = null,
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
                MonoText(image.contentType.mime, MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { onRemove(index) }, enabled = enabled) { Text("移除") }
            }
        }
    }
}

@Composable
private fun FeedSkeleton() {
    SectionCard(title = "清单") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SkeletonBar(widthFraction = 1f, height = 120)
            SkeletonBar(widthFraction = 0.66f, height = 22)
        }
    }
}

@Composable
private fun EmptyState() {
    SectionCard(title = "清单") {
        Text(
            "还没有动态,在上面发布第一条吧。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 24.dp),
        )
    }
}

@Composable
private fun PostCard(
    post: TimelinePostDTO,
    pending: Boolean,
    onRemove: () -> Unit,
) {
    SectionCard(title = Format.dateTime(post.createdAt)) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (post.text.isNotBlank()) {
                Text(
                    text = post.text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            post.images.forEach { image ->
                AsyncImage(
                    model = absoluteUrl(image.url),
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onRemove, enabled = !pending) { Text("删除") }
            }
        }
    }
}

/** Resolve a server-relative upload url (`/uploads/<name>`) against the configured API base. */
private fun absoluteUrl(relative: String): String =
    BuildConfig.API_BASE_URL.trimEnd('/') + relative

/**
 * Read each picked image's bytes + resolved content type off the [Context]'s `ContentResolver`.
 * Unsupported MIME types and unreadable uris are dropped (the server only accepts the known set).
 * Blocking IO — call on a background dispatcher.
 */
private fun readPickedImages(context: Context, uris: List<Uri>): List<PickedImage> {
    val resolver = context.contentResolver
    return uris.mapNotNull { uri ->
        val contentType = TimelineImageContentType.fromMime(resolver.getType(uri)) ?: return@mapNotNull null
        val bytes = runCatching { resolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
        if (bytes == null || bytes.isEmpty() || bytes.size > TimelineLimits.IMAGE_MAX_BYTES) {
            null
        } else {
            PickedImage(bytes = bytes, contentType = contentType)
        }
    }
}
