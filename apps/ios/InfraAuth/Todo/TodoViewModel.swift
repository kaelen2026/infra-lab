import Foundation

/// Owns the current user's todo list plus its create/toggle/delete mutations —
/// the Swift counterpart of web's `useTodos` hook. Mutations update local state
/// from the server's returned DTO (no full re-fetch), keeping the list
/// authoritative without a flash. All state mutates on the main actor.
@MainActor
final class TodoViewModel: ObservableObject {
    /// nil until the first load resolves; drives the loading skeleton.
    @Published private(set) var todos: [TodoDTO]?
    @Published private(set) var error: String?
    /// True while a create is in flight (disables the add form).
    @Published private(set) var creating = false
    /// Ids with a toggle/delete in flight (disables that row).
    @Published private(set) var pendingIds: Set<String> = []

    private let client: TodoClient

    init(client: TodoClient) {
        self.client = client
    }

    var loading: Bool { error == nil && todos == nil }

    /// Load the list once. Idempotent-ish: re-runs only refetch on demand.
    func load() async {
        do {
            todos = try await client.list()
        } catch {
            self.error = "无法加载待办，请稍后重试。"
        }
    }

    func create(title: String) async {
        let normalized = TodoValidation.normalize(title)
        guard !normalized.isEmpty else { return }
        error = nil
        creating = true
        defer { creating = false }
        do {
            let created = try await client.create(title: normalized)
            // List is newest-first; the new item leads.
            todos = [created] + (todos ?? [])
        } catch {
            self.error = "创建失败，请重试。"
        }
    }

    func toggle(_ todo: TodoDTO) async {
        await withPending(todo.id) {
            self.error = nil
            do {
                let updated = try await self.client.toggle(id: todo.id, completed: !todo.completed)
                self.todos = self.todos?.map { $0.id == updated.id ? updated : $0 }
            } catch {
                self.error = "更新失败，请重试。"
            }
        }
    }

    func remove(id: String) async {
        await withPending(id) {
            self.error = nil
            do {
                try await self.client.remove(id: id)
                self.todos = self.todos?.filter { $0.id != id }
            } catch {
                self.error = "删除失败，请重试。"
            }
        }
    }

    private func withPending(_ id: String, _ body: () async -> Void) async {
        pendingIds.insert(id)
        defer { pendingIds.remove(id) }
        await body()
    }
}
