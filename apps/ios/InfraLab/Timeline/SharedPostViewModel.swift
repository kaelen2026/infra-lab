import Foundation

/// Loads one publicly shared post for the deep-link sheet. Works with or
/// without a session — the share endpoint is unauthenticated by design, so the
/// sheet can present over the login flow as well as the signed-in tabs.
@MainActor
final class SharedPostViewModel: ObservableObject {
    enum State: Equatable {
        case loading
        case ready(TimelinePostDTO)
        case failed(message: String)
    }

    @Published private(set) var state: State = .loading

    private let postId: String
    private let client: TimelineClient

    init(postId: String, client: TimelineClient) {
        self.postId = postId
        self.client = client
    }

    func load() async {
        state = .loading
        do {
            let post = try await client.getShared(id: postId)
            state = .ready(post)
        } catch let error as TimelineClientError where error.code == .postNotFound {
            state = .failed(message: "这条动态不存在,或已被作者删除。")
        } catch {
            state = .failed(message: "动态加载失败,请检查网络后重试。")
        }
    }
}
