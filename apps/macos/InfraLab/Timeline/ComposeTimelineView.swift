import AppKit
import PhotosUI
import SwiftUI

/// The publish composer, presented as a sheet: a multi-line text field plus a
/// button to add photos from the library (``PhotosPicker``). On iOS a camera
/// capture button also appears; macOS has no in-app camera picker, so that
/// affordance is compiled out and only library selection is offered (a
/// documented platform degradation). "发布" uploads the images and creates the
/// post; on success the sheet dismisses. Publishing when both text and images
/// are empty is blocked.
struct ComposeTimelineView: View {
    let busy: Bool
    /// Returns true when the post was published (dismiss), false to stay open.
    let onPublish: (String, [PlatformImage]) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var images: [PlatformImage] = []
    @State private var pickerItems: [PhotosPickerItem] = []
    #if os(iOS)
    @State private var showingCamera = false
    #endif

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canPublish: Bool { (!trimmed.isEmpty || !images.isEmpty) && !busy }
    private var canAddMore: Bool { images.count < TimelineValidation.maxImages }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TextField("分享此刻…", text: $text, axis: .vertical)
                        .font(.body)
                        .foregroundStyle(DesignTokens.textPrimary)
                        .lineLimit(3...10)
                        .disabled(busy)
                        .onChange(of: text) { _, new in
                            if new.count > TimelineValidation.maxTextLength {
                                text = String(new.prefix(TimelineValidation.maxTextLength))
                            }
                        }
                        .padding(14)
                        .authFieldBackground()

                    if !images.isEmpty {
                        selectedImages
                    }

                    addImageButtons
                }
                .padding(20)
            }
            .background(AuthBackground())
            .navigationTitle("发布动态")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: publish) {
                        if busy { ProgressView() } else { Text("发布").fontWeight(.medium) }
                    }
                    .tint(DesignTokens.primary)
                    .disabled(!canPublish)
                }
            }
            .onChange(of: pickerItems) { _, items in
                Task { await loadPicked(items) }
            }
            #if os(iOS)
            .sheet(isPresented: $showingCamera) {
                CameraPicker { captured in
                    if canAddMore { images.append(captured) }
                }
                .ignoresSafeArea()
            }
            #endif
        }
    }

    // MARK: - Selected image previews

    private var selectedImages: some View {
        let columns = [GridItem(.adaptive(minimum: 96), spacing: 8)]
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(Array(images.enumerated()), id: \.offset) { index, image in
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radius * 0.7, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Button {
                            images.remove(at: index)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.body)
                                .foregroundStyle(.white, .black.opacity(0.5))
                        }
                        .padding(4)
                        .accessibilityLabel("移除图片")
                    }
            }
        }
    }

    // MARK: - Add-image controls

    private var addImageButtons: some View {
        HStack(spacing: 12) {
            PhotosPicker(
                selection: $pickerItems,
                maxSelectionCount: TimelineValidation.maxImages,
                matching: .images
            ) {
                Label("相册", systemImage: "photo.on.rectangle")
            }
            .disabled(busy || !canAddMore)

            #if os(iOS)
            if CameraPicker.isAvailable {
                Button {
                    showingCamera = true
                } label: {
                    Label("拍照", systemImage: "camera")
                }
                .disabled(busy || !canAddMore)
            }
            #endif

            Spacer()
            Text("\(images.count)/\(TimelineValidation.maxImages)")
                .font(.caption)
                .foregroundStyle(DesignTokens.textSecondary)
        }
        .font(.subheadline)
        .tint(DesignTokens.primary)
    }

    // MARK: - Actions

    private func publish() {
        guard canPublish else { return }
        let value = trimmed
        let payload = images
        Task {
            if await onPublish(value, payload) { dismiss() }
        }
    }

    /// Decode picked library items to `PlatformImage`, respecting the remaining slots.
    @MainActor
    private func loadPicked(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        var loaded: [PlatformImage] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = PlatformImage(data: data) {
                loaded.append(image)
            }
        }
        let room = TimelineValidation.maxImages - images.count
        if room > 0 { images.append(contentsOf: loaded.prefix(room)) }
        pickerItems = []
    }
}

#if os(iOS)
/// Minimal SwiftUI bridge to `UIImagePickerController` for camera capture —
/// SwiftUI has no native camera. Library picking uses ``PhotosPicker`` (no
/// permission prompt); the camera needs `NSCameraUsageDescription` in Info.plist.
/// iOS-only: macOS has no `UIImagePickerController`, so the composer offers
/// library selection only there.
struct CameraPicker: UIViewControllerRepresentable {
    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let parent: CameraPicker

        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
#endif
