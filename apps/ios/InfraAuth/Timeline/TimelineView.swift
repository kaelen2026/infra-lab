import SwiftUI

/// The timeline feed — a scrolling, newest-first list of the user's posts (text
/// + images), with a "发布" button in the nav bar that opens the composer sheet.
/// Loaded once on appear.
struct TimelineView: View {
    @EnvironmentObject private var timeline: TimelineViewModel
    @EnvironmentObject private var auth: AuthViewModel
    @State private var composing = false
    @State private var showingAccount = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TimelineListCard(
                        posts: timeline.posts,
                        loading: timeline.loading,
                        hasMore: timeline.hasMore,
                        pendingIds: timeline.pendingIds,
                        onRemove: { id in Task { await timeline.remove(id: id) } },
                        onLoadMore: { Task { await timeline.loadMore() } }
                    )
                    ErrorBanner(message: timeline.error)
                }
                .padding(20)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(AuthBackground())
            .navigationTitle("动态")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        composing = true
                    } label: {
                        Label("发布", systemImage: "square.and.pencil")
                    }
                    .tint(DesignTokens.primary)
                }
                // Declared last so it pins to the trailing edge — the account
                // entry sits in the same top-right corner on every tab.
                ToolbarItem(placement: .topBarTrailing) {
                    AccountAvatarButton(user: auth.user) { showingAccount = true }
                }
            }
            .sheet(isPresented: $composing) {
                ComposeTimelineView(busy: timeline.publishing) { text, images in
                    await timeline.publish(text: text, images: images)
                }
            }
            .task { await timeline.load() }
        }
        .sheet(isPresented: $showingAccount) { AccountSheet() }
    }
}

/// The feed body: skeleton while loading, an empty state, or the post cards
/// followed by an infinite-scroll footer while older pages remain.
struct TimelineListCard: View {
    let posts: [TimelinePostDTO]?
    let loading: Bool
    let hasMore: Bool
    let pendingIds: Set<String>
    let onRemove: (String) -> Void
    let onLoadMore: () -> Void

    var body: some View {
        if loading {
            VStack(spacing: 12) {
                SkeletonBar(widthFraction: 1, height: 120)
                SkeletonBar(widthFraction: 0.66, height: 22)
            }
        } else if let posts, !posts.isEmpty {
            // Lazy so the footer only materializes (and fires onAppear) when the
            // user actually scrolls near the bottom.
            LazyVStack(spacing: 16) {
                ForEach(posts) { post in
                    TimelinePostCard(
                        post: post,
                        pending: pendingIds.contains(post.id),
                        onRemove: { onRemove(post.id) }
                    )
                }
                if hasMore {
                    ProgressView()
                        .tint(DesignTokens.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .onAppear(perform: onLoadMore)
                }
            }
        } else {
            emptyState
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.title2)
                .foregroundStyle(DesignTokens.textSecondary)
            Text("还没有动态,点右上角发布第一条吧。")
                .font(.subheadline)
                .foregroundStyle(DesignTokens.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }
}

/// One feed card. Content leads: an identity row (avatar + name, quiet relative
/// time, overflow menu), then the text, then the image grid. Delete lives behind
/// the ⋯ button so the card face carries no destructive affordance.
struct TimelinePostCard: View {
    let post: TimelinePostDTO
    let pending: Bool
    let onRemove: () -> Void

    @EnvironmentObject private var auth: AuthViewModel
    @State private var confirmingDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

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
        .opacity(pending ? 0.5 : 1)
        .background(DesignTokens.surface,
                    in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous)
                .strokeBorder(DesignTokens.border, lineWidth: 1)
        )
    }

    private var header: some View {
        HStack(spacing: 10) {
            Text(monogram)
                .font(.footnote.weight(.medium))
                .foregroundStyle(DesignTokens.primaryForeground)
                .frame(width: 36, height: 36)
                .background(DesignTokens.primary, in: Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(auth.user?.displayName ?? "未命名用户")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(DesignTokens.textPrimary)
                    .lineLimit(1)
                Text(Format.relative(post.createdAt))
                    .font(.caption)
                    .foregroundStyle(DesignTokens.textSecondary)
            }

            Spacer(minLength: 8)

            // Public share link: the h5 landing (`/t/:id`) backed by the
            // unauthenticated share endpoint — anyone with the url can read
            // this one post.
            ShareLink(item: shareURL) {
                Image(systemName: "square.and.arrow.up")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("分享")

            // A confirmation dialog instead of a Menu: the single destructive
            // action gets the standard bottom sheet (uniformly red, confirm
            // step included) rather than a floating menu that inherits the
            // app's orange tint on its icon.
            Button {
                confirmingDelete = true
            } label: {
                Image(systemName: "ellipsis")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .disabled(pending)
            .accessibilityLabel("更多操作")
            .confirmationDialog("删除这条动态?", isPresented: $confirmingDelete,
                                titleVisibility: .visible) {
                Button("删除", role: .destructive, action: onRemove)
                Button("取消", role: .cancel) {}
            }
        }
    }

    /// The externally shareable url: the h5 landing resolved against the
    /// configured share origin.
    private var shareURL: URL {
        URL(string: TimelineRoutes.shareLanding(post.id), relativeTo: AppConfig.shareBaseURL)?
            .absoluteURL ?? AppConfig.shareBaseURL
    }

    /// Avatar monogram: first glyph of a name, else the last two phone digits.
    private var monogram: String {
        if let name = auth.user?.displayName?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
            return String(name.prefix(1)).uppercased()
        }
        let digits = (auth.user?.phone ?? "").filter(\.isNumber)
        return digits.isEmpty ? "··" : String(digits.suffix(2))
    }
}

/// A square-cropped image grid: one large image, or an adaptive multi-column grid.
struct TimelineImageGrid: View {
    let images: [TimelineImage]

    @State private var viewer: ImageViewerContext?

    /// 2-up only where it tiles evenly (2 or 4 images); 3-up otherwise — same
    /// column logic as web's `gridCols`, so both feeds read the same.
    private var columnCount: Int { images.count == 2 || images.count == 4 ? 2 : 3 }

    var body: some View {
        content
            .fullScreenCover(item: $viewer) { context in
                ImageViewer(context: context) { viewer = nil }
            }
    }

    @ViewBuilder private var content: some View {
        if images.count == 1 {
            tile(images[0], index: 0)
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        } else {
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: columnCount),
                spacing: 4
            ) {
                ForEach(Array(images.enumerated()), id: \.element.url) { offset, image in
                    tile(image, index: offset)
                        .frame(height: columnCount == 2 ? 140 : 104)
                        .clipShape(
                            RoundedRectangle(cornerRadius: DesignTokens.radius * 0.7, style: .continuous)
                        )
                }
            }
        }
    }

    // The image sits in an overlay of a Color.clear base so its scaled-to-fill
    // size never leaks into layout — a bare `.fill` image reports the scaled
    // width and pushes the grid row wider than the card.
    private func tile(_ image: TimelineImage, index: Int) -> some View {
        Color.clear
            .overlay {
                CachedAsyncImage(url: image.absoluteURL(base: AppConfig.apiBaseURL)) {
                    ZStack {
                        DesignTokens.textSecondary.opacity(0.08)
                        ProgressView().tint(DesignTokens.textSecondary)
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { viewer = ImageViewerContext(images: images, startIndex: index) }
    }
}

#if DEBUG
#Preview {
    TimelineView()
        .environmentObject(TimelineViewModel(client: PreviewTimelineClient()))
        .environmentObject(AuthViewModel(client: PreviewAuthClient()))
}
#endif
