package ai.deeplang.infra.ui.timeline

import ai.deeplang.infra.data.TimelineClient
import ai.deeplang.infra.data.contracts.TimelineImage
import ai.deeplang.infra.data.contracts.TimelineImageContentType
import ai.deeplang.infra.data.contracts.TimelineInput
import ai.deeplang.infra.data.contracts.TimelineLimits
import ai.deeplang.infra.data.contracts.TimelinePostDTO
import ai.deeplang.infra.di.ServiceLocator
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * An image already read off the device (bytes + resolved content type), ready to upload. The screen
 * reads the picked `Uri` via the `ContentResolver`; keeping the bytes here rather than a `Uri` keeps
 * the ViewModel free of Android framework types, so it stays unit-testable with a fake client.
 */
data class PickedImage(
    val bytes: ByteArray,
    val contentType: TimelineImageContentType,
) {
    // ByteArray has reference equality; posts/state never compare PickedImage, but data classes
    // generate equals/hashCode, so override to compare contents (avoids a detekt/array-equals trap).
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PickedImage) return false
        return contentType == other.contentType && bytes.contentEquals(other.bytes)
    }

    override fun hashCode(): Int = 31 * bytes.contentHashCode() + contentType.hashCode()
}

/**
 * Owns the current user's timeline plus its publish/delete mutations — the Kotlin counterpart of
 * iOS's `TimelineViewModel`. Publishing is a two-step flow: each picked image is uploaded first,
 * then the post is created referencing the returned urls. New posts prepend to the local list
 * (newest-first) so the feed updates without a full re-fetch.
 */
data class TimelineUiState(
    /** null until the first load resolves; drives the loading skeleton. */
    val posts: List<TimelinePostDTO>? = null,
    /** Opaque cursor for the next (older) page; null once the feed is exhausted. */
    val nextCursor: String? = null,
    /** True while an older page is being appended (drives the footer spinner). */
    val loadingMore: Boolean = false,
    val error: String? = null,
    /** True while a publish is in flight (disables the composer's publish button). */
    val publishing: Boolean = false,
    /** Ids with a delete in flight (disables that post's delete action). */
    val pendingIds: Set<String> = emptySet(),
) {
    val loading: Boolean get() = error == null && posts == null

    /** True when an older page exists (drives the infinite-scroll footer). */
    val hasMore: Boolean get() = nextCursor != null
}

class TimelineViewModel(private val client: TimelineClient) : ViewModel() {

    private val _state = MutableStateFlow(TimelineUiState())
    val state: StateFlow<TimelineUiState> = _state.asStateFlow()

    /** (Re)load the first page, resetting the pagination cursor. */
    fun load() {
        viewModelScope.launch {
            runCatching { client.list() }
                .onSuccess { page ->
                    _state.update { it.copy(posts = page.posts, nextCursor = page.nextCursor, error = null) }
                }
                .onFailure { _state.update { it.copy(error = "无法加载动态，请稍后重试。") } }
        }
    }

    /**
     * Append the next (older) page. No-op while one is in flight or at the end; on failure the
     * cursor is kept, so scrolling to the footer again retries.
     */
    fun loadMore() {
        val current = _state.value
        val cursor = current.nextCursor ?: return
        if (current.loadingMore) return
        viewModelScope.launch {
            _state.update { it.copy(loadingMore = true) }
            runCatching { client.list(cursor = cursor) }
                .onSuccess { page ->
                    _state.update { s ->
                        // Publishing prepends locally, so drop any id the list already shows.
                        val existing = (s.posts ?: emptyList()).mapTo(mutableSetOf()) { it.id }
                        val merged = (s.posts ?: emptyList()) + page.posts.filterNot { existing.contains(it.id) }
                        s.copy(posts = merged, nextCursor = page.nextCursor, loadingMore = false)
                    }
                }
                .onFailure {
                    _state.update { it.copy(loadingMore = false, error = "无法加载更多动态，请稍后重试。") }
                }
        }
    }

    /**
     * Upload every image, then create the post. [onPublished] fires with true when the post was
     * published (so the composer can dismiss), false to stay open with the error shown. A post with
     * neither text nor images is rejected locally.
     */
    fun publish(rawText: String, images: List<PickedImage>, onPublished: (Boolean) -> Unit = {}) {
        val text = TimelineInput.normalizeText(rawText)
        if (text.isEmpty() && images.isEmpty()) {
            onPublished(false)
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(publishing = true, error = null) }
            val result = runCatching {
                val refs = mutableListOf<TimelineImage>()
                for (image in images.take(TimelineLimits.MAX_IMAGES)) {
                    refs.add(client.uploadImage(image.bytes, image.contentType))
                }
                client.create(text, refs)
            }
            result
                .onSuccess { created ->
                    _state.update { it.copy(publishing = false, posts = listOf(created) + (it.posts ?: emptyList())) }
                    onPublished(true)
                }
                .onFailure {
                    _state.update { it.copy(publishing = false, error = "发布失败，请重试。") }
                    onPublished(false)
                }
        }
    }

    fun remove(id: String) {
        viewModelScope.launch {
            _state.update { it.copy(pendingIds = it.pendingIds + id, error = null) }
            runCatching { client.remove(id) }
                .onSuccess { _state.update { s -> s.copy(posts = s.posts?.filterNot { it.id == id }) } }
                .onFailure { _state.update { it.copy(error = "删除失败，请重试。") } }
            _state.update { it.copy(pendingIds = it.pendingIds - id) }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                TimelineViewModel(ServiceLocator.timelineClient()) as T
        }
    }
}
