import AVFoundation
import SwiftUI

/// QR scanner sheet: a live camera feed locked to QR codes, with a cancel toolbar.
/// Delivers the first decoded payload via `onScan` and leaves dismissal to the
/// caller. Camera permission must already be granted — gate presentation on
/// ``QrScannerView/requestCameraAccess()``.
struct QrScannerSheet: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            QrScannerView(onScan: onScan)
                .ignoresSafeArea()
                .frame(minWidth: 480, minHeight: 360)
                .navigationTitle("扫描登录二维码")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("取消") { dismiss() }
                            .tint(DesignTokens.primary)
                    }
                }
        }
    }
}

/// SwiftUI bridge to an AVFoundation capture session recognizing QR codes only —
/// macOS has no VisionKit `DataScannerViewController`. The web login QR encodes the
/// public `ticketId` string verbatim, so the first recognized payload is forwarded
/// as-is. No camera / no permission degrades safely: the session simply never
/// starts and no payload is delivered.
struct QrScannerView: NSViewRepresentable {
    let onScan: (String) -> Void

    /// Whether this Mac has a usable video capture device.
    static var isSupported: Bool { AVCaptureDevice.default(for: .video) != nil }

    /// Prompt for camera access if undetermined; false when denied/restricted.
    static func requestCameraAccess() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .video)
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    func makeNSView(context: Context) -> CameraPreviewView {
        let view = CameraPreviewView()
        context.coordinator.configureSession(for: view)
        return view
    }

    func updateNSView(_ nsView: CameraPreviewView, context: Context) {}

    static func dismantleNSView(_ nsView: CameraPreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    /// Owns the capture session and maps QR metadata to `onScan`. Not `@MainActor`,
    /// but the metadata delegate and `onScan` are pinned to the main queue so the
    /// downstream `@MainActor QrApproveViewModel` is touched on the main actor.
    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        private let onScan: (String) -> Void
        private let session = AVCaptureSession()
        // start/stopRunning block, so keep them off the main thread (AVFoundation's
        // standard pattern) — this is genuine blocking work, not a networking bridge.
        private let sessionQueue = DispatchQueue(label: "dev.w3ctech.infralab.qr.session")
        /// Latch so one physical code can't fire multiple approvals.
        private var didScan = false

        init(onScan: @escaping (String) -> Void) {
            self.onScan = onScan
        }

        func configureSession(for view: CameraPreviewView) {
            guard let device = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: device),
                  session.canAddInput(input) else { return }
            session.addInput(input)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            // availableMetadataObjectTypes is only populated once the output is added.
            output.metadataObjectTypes = output.availableMetadataObjectTypes.contains(.qr) ? [.qr] : []

            view.setSession(session)
            sessionQueue.async { [session] in session.startRunning() }
        }

        func stop() {
            sessionQueue.async { [session] in
                if session.isRunning { session.stopRunning() }
            }
        }

        func metadataOutput(
            _ output: AVCaptureMetadataOutput,
            didOutput metadataObjects: [AVMetadataObject],
            from connection: AVCaptureConnection
        ) {
            guard !didScan else { return }
            for object in metadataObjects {
                guard let code = object as? AVMetadataMachineReadableCodeObject,
                      code.type == .qr,
                      let payload = code.stringValue else { continue }
                didScan = true
                stop()
                onScan(payload)
                return
            }
        }
    }
}

/// A layer-backed `NSView` that renders the capture session's live preview,
/// keeping the preview layer sized to the view.
final class CameraPreviewView: NSView {
    private var previewLayer: AVCaptureVideoPreviewLayer?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
    }

    // Never instantiated from a nib; fail rather than force-unwrap a decoder.
    required init?(coder: NSCoder) { nil }

    func setSession(_ session: AVCaptureSession) {
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = bounds
        layer?.addSublayer(preview)
        previewLayer = preview
    }

    override func layout() {
        super.layout()
        previewLayer?.frame = bounds
    }
}
