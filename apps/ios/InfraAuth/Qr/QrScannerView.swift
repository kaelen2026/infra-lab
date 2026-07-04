import AVFoundation
import SwiftUI
import VisionKit

/// Full-screen QR scanner sheet: a VisionKit live camera feed locked to QR codes,
/// with a cancel toolbar. Delivers the first decoded payload via `onScan` and
/// leaves dismissal to the caller. Camera permission must already be granted —
/// gate presentation on ``QrScannerView/requestCameraAccess()``.
struct QrScannerSheet: View {
    let onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            QrScannerView(onScan: onScan)
                .ignoresSafeArea()
                .navigationTitle("扫描登录二维码")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("取消") { dismiss() }
                            .tint(DesignTokens.primary)
                    }
                }
        }
    }
}

/// SwiftUI bridge to VisionKit's `DataScannerViewController`, recognizing QR codes
/// only — SwiftUI has no native scanner. The web login QR encodes the public
/// `ticketId` string verbatim, so the first recognized payload is forwarded as-is.
struct QrScannerView: UIViewControllerRepresentable {
    let onScan: (String) -> Void

    /// Whether this device can scan at all (no camera / simulator → false).
    static var isSupported: Bool { DataScannerViewController.isSupported }

    /// Prompt for camera access if undetermined; false when denied/restricted.
    static func requestCameraAccess() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .video)
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .balanced,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        // The camera session can only start once the view is in a window, so kick
        // it here (first layout pass) instead of in makeUIViewController.
        guard !scanner.isScanning, !context.coordinator.didScan else { return }
        try? scanner.startScanning()
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        private let onScan: (String) -> Void
        /// Latch so one physical code can't fire multiple approvals.
        private(set) var didScan = false

        init(onScan: @escaping (String) -> Void) {
            self.onScan = onScan
        }

        func dataScanner(
            _ scanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            guard !didScan else { return }
            for item in addedItems {
                guard case let .barcode(barcode) = item,
                      let payload = barcode.payloadStringValue else { continue }
                didScan = true
                scanner.stopScanning()
                onScan(payload)
                return
            }
        }
    }
}
