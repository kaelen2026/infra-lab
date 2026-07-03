import SwiftUI

/// The timeline feed — a scrolling, newest-first list of the user's posts (text
/// + images), with a "发布" button in the nav bar that opens the composer sheet.
/// Loaded once on appear.
struct TimelineView: View {
    @EnvironmentObject private var timeline: TimelineViewModel
    @State private var composing = false

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
            }
            .sheet(isPresented: $composing) {
                ComposeTimelineView(busy: timeline.publishing) { text, images in
                    await timeline.publish(text: text, images: images)
                }
            }
            .task { await timeline.load() }
        }
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

/// One post: optional text, an image grid, a timestamp, and a delete action.
struct TimelinePostCard: View {
    let post: TimelinePostDTO
    let pending: Bool
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !post.text.isEmpty {
                Text(post.text)
                    .font(.body)
                    .foregroundStyle(DesignTokens.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !post.images.isEmpty {
                TimelineImageGrid(images: post.images)
            }

            HStack {
                Text(Format.dateTime(post.createdAt))
                    .font(.caption)
                    .foregroundStyle(DesignTokens.textSecondary)
                Spacer()
                Button(action: onRemove) {
                    Image(systemName: "trash")
                        .font(.subheadline)
                        .foregroundStyle(DesignTokens.textSecondary)
                }
                .buttonStyle(.plain)
                .disabled(pending)
                .accessibilityLabel("删除")
            }
        }
        .padding(16)
        .opacity(pending ? 0.5 : 1)
        .background(DesignTokens.surface,
                    in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous)
                .strokeBorder(DesignTokens.border, lineWidth: 1)
        )
    }
}

/// A square-cropped image grid: one large image, or an adaptive multi-column grid.
struct TimelineImageGrid: View {
    let images: [TimelineImage]

    private let columns = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]

    var body: some View {
        if images.count == 1 {
            tile(images[0])
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        } else {
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(images, id: \.url) { image in
                    tile(image)
                        .frame(height: 120)
                        .clipShape(
                            RoundedRectangle(cornerRadius: DesignTokens.radius * 0.7, style: .continuous)
                        )
                }
            }
        }
    }

    private func tile(_ image: TimelineImage) -> some View {
        CachedAsyncImage(url: image.absoluteURL(base: AppConfig.apiBaseURL)) {
            ZStack {
                DesignTokens.textSecondary.opacity(0.08)
                ProgressView().tint(DesignTokens.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

#if DEBUG
#Preview {
    TimelineView().environmentObject(TimelineViewModel(client: PreviewTimelineClient()))
}
#endif
