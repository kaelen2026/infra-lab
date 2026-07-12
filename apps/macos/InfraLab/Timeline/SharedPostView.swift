import SwiftUI

/// Sheet for a single shared post, opened via `infralab://timeline/<id>` (the
/// h5 share landing's "在 app 中查看", or a push notification's `link`). Unlike
/// the feed card it shows no author identity or actions: the public DTO carries
/// none, matching the h5 share landing.
struct SharedPostView: View {
    @StateObject private var model: SharedPostViewModel
    @Environment(\.dismiss) private var dismiss

    init(postId: String, client: TimelineClient) {
        _model = StateObject(wrappedValue: SharedPostViewModel(postId: postId, client: client))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                content
                    .padding(20)
                    .frame(maxWidth: 560)
                    .frame(maxWidth: .infinity)
            }
            .background(AuthBackground())
            .navigationTitle("分享的动态")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                        .tint(DesignTokens.primary)
                }
            }
            .task { await model.load() }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            VStack(spacing: 12) {
                SkeletonBar(widthFraction: 1, height: 120)
                SkeletonBar(widthFraction: 0.66, height: 22)
            }
        case let .failed(message):
            ErrorBanner(message: message)
        case let .ready(post):
            card(post)
        }
    }

    private func card(_ post: TimelinePostDTO) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(Format.relative(post.createdAt))
                .font(.caption)
                .foregroundStyle(DesignTokens.textSecondary)

            if !post.text.isEmpty {
                Text(post.text)
                    .font(.body)
                    .foregroundStyle(DesignTokens.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !post.images.isEmpty {
                TimelineImageGrid(images: post.images)
            }
        }
        .padding(14)
        .background(DesignTokens.surface,
                    in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous)
                .strokeBorder(DesignTokens.border, lineWidth: 1)
        )
    }
}

#if DEBUG
#Preview {
    SharedPostView(postId: "preview", client: PreviewTimelineClient())
}
#endif
