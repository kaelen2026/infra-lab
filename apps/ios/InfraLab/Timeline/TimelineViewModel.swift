import UIKit

/// Owns the current user's timeline plus its publish/delete mutations. Publishing
/// is a two-step flow: each picked/captured image is uploaded first, then the post
/// is created referencing the returned urls. New posts prepend to the local list
/// (newest-first) so the feed updates without a full re-fetch. All state mutates
/// on the main actor.
@MainActor
final class TimelineViewModel: ObservableObject {
    /// nil until the first load resolves; drives the loading skeleton.
    @Published private(set) var posts: [TimelinePostDTO]?
    /// Opaque cursor for the next (older) page; nil once the feed is exhausted.
    @Published private(set) var nextCursor: String?
    /// True while an older page is being appended (drives the footer spinner).
    @Published private(set) var loadingMore = false
    @Published private(set) var error: String?
    /// True while a publish is in flight (disables the composer's publish button).
    @Published private(set) var publishing = false
    /// Ids with a delete in flight (disables that post's delete action).
    @Published private(set) var pendingIds: Set<String> = []

    private let client: TimelineClient
    /// JPEG quality for re-encoding picked/captured images before upload.
    private let jpegQuality: CGFloat = 0.8

    init(client: TimelineClient) {
        self.client = client
    }

    var loading: Bool { error == nil && posts == nil }
    /// True when an older page exists (drives the infinite-scroll footer).
    var hasMore: Bool { nextCursor != nil }

    /// (Re)load the first page, resetting the pagination cursor.
    func load() async {
        do {
            let page = try await client.list()
            posts = page.posts
            nextCursor = page.nextCursor
        } catch {
            self.error = "无法加载动态，请稍后重试。"
        }
    }

    /// Append the next (older) page. No-op while one is in flight or at the end;
    /// on failure the cursor is kept, so scrolling to the footer again retries.
    func loadMore() async {
        guard let cursor = nextCursor, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let page = try await client.list(cursor: cursor, limit: nil)
            // Publishing prepends locally, so drop any id the list already shows.
            let existing = Set((posts ?? []).map(\.id))
            posts = (posts ?? []) + page.posts.filter { !existing.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            self.error = "无法加载更多动态，请稍后重试。"
        }
    }

    /// Upload every image, then create the post. Returns true on success so the
    /// composer sheet can dismiss; false leaves it open with the error shown.
    func publish(text: String, images: [UIImage]) async -> Bool {
        let normalized = TimelineValidation.normalize(text)
        guard !normalized.isEmpty || !images.isEmpty else { return false }

        error = nil
        publishing = true
        defer { publishing = false }

        do {
            var refs: [TimelineImage] = []
            for image in images.prefix(TimelineValidation.maxImages) {
                guard let data = image.jpegData(compressionQuality: jpegQuality) else { continue }
                let ref = try await client.uploadImage(data, contentType: .jpeg)
                refs.append(ref)
            }
            let created = try await client.create(text: normalized, images: refs)
            posts = [created] + (posts ?? [])
            return true
        } catch {
            self.error = "发布失败，请重试。"
            return false
        }
    }

    func remove(id: String) async {
        pendingIds.insert(id)
        defer { pendingIds.remove(id) }
        error = nil
        do {
            try await client.remove(id: id)
            posts = posts?.filter { $0.id != id }
        } catch {
            self.error = "删除失败，请重试。"
        }
    }
}
