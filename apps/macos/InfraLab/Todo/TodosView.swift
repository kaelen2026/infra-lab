import SwiftUI

/// The todo list — the iOS counterpart of web's todos page: a composer plus the
/// per-user list with completion toggle and delete. Loaded once on appear.
struct TodosView: View {
    @EnvironmentObject private var todos: TodoViewModel
    @EnvironmentObject private var auth: AuthViewModel
    @State private var showingAccount = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    AddTodoForm(busy: todos.creating) { title in
                        await todos.create(title: title)
                    }
                    TodoListCard(
                        todos: todos.todos,
                        loading: todos.loading,
                        pendingIds: todos.pendingIds,
                        onToggle: { todo in Task { await todos.toggle(todo) } },
                        onRemove: { id in Task { await todos.remove(id: id) } }
                    )
                    ErrorBanner(message: todos.error)
                }
                .padding(20)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(AuthBackground())
            .navigationTitle("待办")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    AccountAvatarButton(user: auth.user) { showingAccount = true }
                }
            }
            .task { await todos.load() }
        }
        .sheet(isPresented: $showingAccount) { AccountSheet() }
    }
}

/// Single-line composer: type a title, submit adds it. Clears on success.
struct AddTodoForm: View {
    let busy: Bool
    let onAdd: (String) async -> Void

    @State private var title = ""
    @FocusState private var focused: Bool

    private var trimmed: String { title.trimmingCharacters(in: .whitespaces) }
    private var canSubmit: Bool { !trimmed.isEmpty && !busy }

    var body: some View {
        HStack(spacing: 8) {
            TextField("添加一项待办…", text: $title)
                .font(.body)
                .foregroundStyle(DesignTokens.textPrimary)
                .focused($focused)
                .disabled(busy)
                .submitLabel(.done)
                .onSubmit(submit)
                .onChange(of: title) { _, new in
                    if new.count > TodoValidation.maxTitleLength {
                        title = String(new.prefix(TodoValidation.maxTitleLength))
                    }
                }
                .padding(14)
                .authFieldBackground()

            Button(action: submit) {
                ZStack {
                    Label("添加", systemImage: "plus").labelStyle(.titleAndIcon).opacity(busy ? 0 : 1)
                    if busy { ProgressView().tint(DesignTokens.primaryForeground) }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(DesignTokens.primaryForeground)
                .padding(.horizontal, 16)
                .frame(height: 50)
                .background(DesignTokens.primary.opacity(canSubmit ? 1 : 0.4),
                            in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
            }
            .disabled(!canSubmit)
        }
    }

    private func submit() {
        guard canSubmit else { return }
        let value = trimmed
        Task {
            await onAdd(value)
            title = ""
        }
    }
}

/// The list body: skeleton while loading, an empty state, or the divided rows.
struct TodoListCard: View {
    let todos: [TodoDTO]?
    let loading: Bool
    let pendingIds: Set<String>
    let onToggle: (TodoDTO) -> Void
    let onRemove: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if loading {
                VStack(spacing: 12) {
                    SkeletonBar(widthFraction: 1, height: 22)
                    SkeletonBar(widthFraction: 0.75, height: 22)
                    SkeletonBar(widthFraction: 0.66, height: 22)
                }
                .padding(4)
            } else if let todos, !todos.isEmpty {
                VStack(spacing: 0) {
                    ForEach(todos) { todo in
                        TodoRow(
                            todo: todo,
                            pending: pendingIds.contains(todo.id),
                            onToggle: { onToggle(todo) },
                            onRemove: { onRemove(todo.id) }
                        )
                    }
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "checklist")
                        .font(.title2)
                        .foregroundStyle(DesignTokens.textSecondary)
                    Text("还没有待办,在上面添加第一项吧。")
                        .font(.subheadline)
                        .foregroundStyle(DesignTokens.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(DesignTokens.surface,
                    in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous)
                .strokeBorder(DesignTokens.border, lineWidth: 1)
        )
    }
}

/// One row: a round completion toggle, the title, and a delete action.
struct TodoRow: View {
    let todo: TodoDTO
    let pending: Bool
    let onToggle: () -> Void
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggle) {
                ZStack {
                    Circle()
                        .strokeBorder(todo.completed ? DesignTokens.primary : DesignTokens.border, lineWidth: 1.5)
                        .background(Circle().fill(todo.completed ? DesignTokens.primary : .clear))
                        .frame(width: 22, height: 22)
                    if todo.completed {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(DesignTokens.primaryForeground)
                    }
                }
            }
            .buttonStyle(.plain)
            .disabled(pending)
            .accessibilityLabel(todo.completed ? "标记为未完成" : "标记为已完成")

            Text(todo.title)
                .font(.subheadline)
                .foregroundStyle(todo.completed ? DesignTokens.textSecondary : DesignTokens.textPrimary)
                .strikethrough(todo.completed)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onRemove) {
                Image(systemName: "trash")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
            }
            .buttonStyle(.plain)
            .disabled(pending)
            .accessibilityLabel("删除")
        }
        .padding(.vertical, 12)
        .opacity(pending ? 0.5 : 1)
        .overlay(alignment: .bottom) {
            Rectangle().fill(DesignTokens.border.opacity(0.6)).frame(height: 1)
        }
    }
}

#if DEBUG
#Preview {
    TodosView()
        .environmentObject(TodoViewModel(client: PreviewTodoClient()))
        .environmentObject(AuthViewModel(client: PreviewAuthClient()))
}
#endif
