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
/// images; pinch (or double-tap) to zoom; drag down to dismiss, the black
/// backdrop fading out as you pull away. The large image reuses the same
/// `/uploads/…` url as the grid thumbnail.
struct ImageViewer: View {
    let context: ImageViewerContext
    let onClose: () -> Void

    @State private var index: Int
    @State private var dragOffset: CGFloat = 0
    @State private var zoomedIn = false

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
                    ZoomableImage(
                        image: image,
                        isActive: offset == index,
                        onZoomChanged: { zoomedIn = $0 }
                    )
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
                // While zoomed a drag pans the image, not the sheet.
                guard !zoomedIn else { return }
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

/// One zoomable page of the viewer: pinch to zoom 1–4× (with panning while
/// zoomed), double-tap to toggle 2.5×. Zoom resets when the pager moves off this
/// page, and the parent is told whenever zoom starts/ends so it can pause
/// drag-to-dismiss.
private struct ZoomableImage: View {
    let image: TimelineImage
    let isActive: Bool
    let onZoomChanged: (Bool) -> Void

    @State private var scale: CGFloat = 1
    @State private var pinchScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var panTranslation: CGSize = .zero

    private static let maxScale: CGFloat = 4
    private static let doubleTapScale: CGFloat = 2.5

    var body: some View {
        GeometryReader { proxy in
            CachedAsyncImage(
                url: image.absoluteURL(base: AppConfig.apiBaseURL),
                contentMode: .fit
            ) {
                ProgressView().tint(.white)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .scaleEffect(min(max(scale * pinchScale, 0.8), Self.maxScale))
            .offset(x: offset.width + panTranslation.width,
                    y: offset.height + panTranslation.height)
            .contentShape(Rectangle())
            .onTapGesture(count: 2) { toggleZoom() }
            .gesture(pinch(in: proxy.size))
            // High priority so a pan on a zoomed image beats the TabView's
            // horizontal paging; disabled entirely at 1× so paging still works.
            .highPriorityGesture(pan(in: proxy.size), including: scale > 1 ? .all : .subviews)
        }
        .onChange(of: isActive) { _, active in
            if !active { reset(animated: false) }
        }
    }

    private func pinch(in size: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                pinchScale = value.magnification
                onZoomChanged(true)
            }
            .onEnded { value in
                scale = min(max(scale * value.magnification, 1), Self.maxScale)
                pinchScale = 1
                if scale <= 1.01 {
                    reset(animated: true)
                } else {
                    offset = clampedOffset(offset, in: size)
                    onZoomChanged(true)
                }
            }
    }

    private func pan(in size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in panTranslation = value.translation }
            .onEnded { value in
                let proposed = CGSize(width: offset.width + value.translation.width,
                                      height: offset.height + value.translation.height)
                withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                    offset = clampedOffset(proposed, in: size)
                    panTranslation = .zero
                }
            }
    }

    private func toggleZoom() {
        if scale > 1 {
            reset(animated: true)
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                scale = Self.doubleTapScale
            }
            onZoomChanged(true)
        }
    }

    private func reset(animated: Bool) {
        withAnimation(animated ? .spring(response: 0.3, dampingFraction: 0.85) : nil) {
            scale = 1
            pinchScale = 1
            offset = .zero
            panTranslation = .zero
        }
        onZoomChanged(false)
    }

    /// Keep the pan within the zoomed image's overflow so it can't be dragged
    /// fully off-screen. Approximated against the container size — a letterboxed
    /// image allows a little slack, which reads as normal give.
    private func clampedOffset(_ proposed: CGSize, in size: CGSize) -> CGSize {
        let maxX = (scale - 1) * size.width / 2
        let maxY = (scale - 1) * size.height / 2
        return CGSize(width: min(max(proposed.width, -maxX), maxX),
                      height: min(max(proposed.height, -maxY), maxY))
    }
}
