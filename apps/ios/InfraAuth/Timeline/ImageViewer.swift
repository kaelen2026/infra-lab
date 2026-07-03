import SwiftUI

/// What a tapped thumbnail hands the fullscreen viewer: the post's images and the
/// one that was tapped. `Identifiable` so it drives `.fullScreenCover(item:)`.
struct ImageViewerContext: Identifiable {
    let id = UUID()
    let images: [TimelineImage]
    let startIndex: Int
}

/// Fullscreen photo viewer — the iOS counterpart of the web lightbox. Tap a
/// thumbnail to open; swipe left/right (paged `TabView`) to move between a post's
/// images; drag down to dismiss, the black backdrop fading out as you pull away.
/// The large image reuses the same `/uploads/…` url as the grid thumbnail.
struct ImageViewer: View {
    let context: ImageViewerContext
    let onClose: () -> Void

    @State private var index: Int
    @State private var dragOffset: CGFloat = 0

    init(context: ImageViewerContext, onClose: @escaping () -> Void) {
        self.context = context
        self.onClose = onClose
        _index = State(initialValue: context.startIndex)
    }

    /// 0 → at rest, 1 → dragged a full dismiss distance; drives backdrop/chrome fade.
    private var dismissProgress: CGFloat {
        min(abs(dragOffset) / 260, 1)
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black
                .opacity(1 - dismissProgress * 0.7)
                .ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(Array(context.images.enumerated()), id: \.element.url) { offset, image in
                    CachedAsyncImage(
                        url: image.absoluteURL(base: AppConfig.apiBaseURL),
                        contentMode: .fit
                    ) {
                        ProgressView().tint(.white)
                    }
                    .tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .offset(y: dragOffset)
            // Simultaneous so horizontal paging still reaches the TabView; we only
            // follow a predominantly-downward drag and dismiss it past a threshold.
            .simultaneousGesture(dismissDrag)

            header
        }
    }

    private var dismissDrag: some Gesture {
        DragGesture()
            .onChanged { value in
                let dy = value.translation.height
                if dy > 0, dy > abs(value.translation.width) {
                    dragOffset = dy
                }
            }
            .onEnded { _ in
                if dragOffset > 120 {
                    onClose()
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private var header: some View {
        HStack {
            if context.images.count > 1 {
                Text("\(index + 1) / \(context.images.count)")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
            }
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(10)
                    .background(.black.opacity(0.4), in: Circle())
            }
            .accessibilityLabel("关闭")
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .opacity(1 - dismissProgress)
    }
}
