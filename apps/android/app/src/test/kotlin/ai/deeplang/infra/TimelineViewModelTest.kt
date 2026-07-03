package ai.deeplang.infra

import ai.deeplang.infra.data.TimelineClient
import ai.deeplang.infra.data.TimelineException
import ai.deeplang.infra.data.contracts.TimelineImage
import ai.deeplang.infra.data.contracts.TimelineImageContentType
import ai.deeplang.infra.data.contracts.TimelinePage
import ai.deeplang.infra.data.contracts.TimelinePostDTO
import ai.deeplang.infra.ui.timeline.PickedImage
import ai.deeplang.infra.ui.timeline.TimelineViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** In-memory [TimelineClient] fake; newest-first and offset-paged, like the server. */
private class FakeTimelineClient(
    seed: List<TimelinePostDTO> = emptyList(),
    private val pageSize: Int = 20,
) : TimelineClient {
    val posts = seed.toMutableList()
    var failNext = false
    var uploadCount = 0

    override suspend fun list(cursor: String?, limit: Int?): TimelinePage = maybeFail {
        val start = cursor?.toIntOrNull() ?: 0
        val end = minOf(start + pageSize, posts.size)
        val slice = if (start < end) posts.subList(start, end).toList() else emptyList()
        val next = if (end < posts.size) end.toString() else null
        TimelinePage(posts = slice, nextCursor = next)
    }

    override suspend fun uploadImage(
        bytes: ByteArray,
        contentType: TimelineImageContentType,
    ): TimelineImage = maybeFail {
        uploadCount++
        TimelineImage(url = "/uploads/img$uploadCount.jpg")
    }

    override suspend fun create(text: String, images: List<TimelineImage>): TimelinePostDTO = maybeFail {
        val post = TimelinePostDTO(
            id = "new-${posts.size + 1}",
            text = text,
            images = images,
            createdAt = "t",
            updatedAt = "t",
        )
        posts.add(0, post)
        post
    }

    override suspend fun remove(id: String) {
        maybeFail { posts.removeAll { it.id == id } }
    }

    private fun <T> maybeFail(block: () -> T): T {
        if (failNext) {
            failNext = false
            throw TimelineException(code = null, status = 500, message = "boom")
        }
        return block()
    }
}

class TimelineViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    @Test
    fun `load populates the first page`() {
        val vm = TimelineViewModel(FakeTimelineClient(listOf(post("a", "one"))))
        vm.load()
        assertEquals(listOf("one"), vm.state.value.posts?.map { it.text })
        assertFalse(vm.state.value.loading)
    }

    @Test
    fun `loadMore appends the older page and exhausts the cursor`() {
        val seed = listOf(post("a", "1"), post("b", "2"), post("c", "3"))
        val vm = TimelineViewModel(FakeTimelineClient(seed, pageSize = 2))
        vm.load()
        assertEquals(listOf("1", "2"), vm.state.value.posts?.map { it.text })
        assertTrue(vm.state.value.hasMore)

        vm.loadMore()
        assertEquals(listOf("1", "2", "3"), vm.state.value.posts?.map { it.text })
        assertFalse(vm.state.value.hasMore)
    }

    @Test
    fun `publish uploads images then prepends the new post`() {
        val client = FakeTimelineClient(listOf(post("a", "old")))
        val vm = TimelineViewModel(client)
        vm.load()

        var published: Boolean? = null
        vm.publish("hello", listOf(picked()), onPublished = { published = it })

        assertEquals(true, published)
        assertEquals(1, client.uploadCount)
        val first = vm.state.value.posts?.first()
        assertEquals("hello", first?.text)
        assertEquals(listOf("/uploads/img1.jpg"), first?.images?.map { it.url })
        assertEquals(listOf("hello", "old"), vm.state.value.posts?.map { it.text })
    }

    @Test
    fun `publish rejects an empty post without a network call`() {
        val client = FakeTimelineClient(listOf(post("a", "old")))
        val vm = TimelineViewModel(client)
        vm.load()

        var published: Boolean? = null
        vm.publish("   ", emptyList(), onPublished = { published = it })

        assertEquals(false, published)
        assertEquals(0, client.uploadCount)
        assertEquals(listOf("old"), vm.state.value.posts?.map { it.text })
    }

    @Test
    fun `remove drops the post`() {
        val vm = TimelineViewModel(FakeTimelineClient(listOf(post("a", "gone"))))
        vm.load()
        vm.remove("a")
        assertEquals(emptyList<String>(), vm.state.value.posts?.map { it.text })
        assertTrue(vm.state.value.pendingIds.isEmpty())
    }

    @Test
    fun `a failed load surfaces a generic error`() {
        val client = FakeTimelineClient().apply { failNext = true }
        val vm = TimelineViewModel(client)
        vm.load()
        assertNull(vm.state.value.posts)
        assertEquals("无法加载动态，请稍后重试。", vm.state.value.error)
    }

    private fun post(id: String, text: String) =
        TimelinePostDTO(id = id, text = text, createdAt = "t", updatedAt = "t")

    private fun picked() =
        PickedImage(bytes = byteArrayOf(1, 2, 3), contentType = TimelineImageContentType.JPEG)
}
