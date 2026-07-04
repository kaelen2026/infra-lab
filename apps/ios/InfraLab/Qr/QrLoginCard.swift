import SwiftUI

/// Account-sheet entry for QR cross-device login: the signed-in user scans the QR
/// the web renders and confirms here, signing that browser in as this user. The
/// iOS counterpart of Android's `QrLoginCard`, plus an explicit confirm alert
/// between scan and approve.
struct QrLoginCard: View {
    @ObservedObject var viewModel: QrApproveViewModel
    @State private var showingScanner = false
    @State private var scanError: String?

    var body: some View {
        SectionCard(title: "扫码登录网页版", systemImage: "qrcode.viewfinder") {
            VStack(alignment: .leading, spacing: 12) {
                Text("用手机扫描网页端的登录二维码，在此确认后网页端即可以你的账号登录。")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)

                statusLine

                if viewModel.phase != .approving {
                    Button(scanButtonTitle) {
                        Task { await startScan() }
                    }
                    .font(.subheadline.weight(.medium))
                    .tint(DesignTokens.primary)
                }
            }
        }
        .sheet(isPresented: $showingScanner) {
            QrScannerSheet { payload in
                showingScanner = false
                viewModel.handleScan(payload)
            }
        }
        .alert(
            "确认登录网页版？",
            isPresented: confirmPresented,
            presenting: viewModel.pendingTicketId
        ) { ticketId in
            Button("取消", role: .cancel) { viewModel.cancelPending() }
            Button("确认") { Task { await viewModel.approve(ticketId: ticketId) } }
        } message: { _ in
            Text("确认后，网页端将以你的账号登录。")
        }
    }

    @ViewBuilder private var statusLine: some View {
        switch viewModel.phase {
        case .approving:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("确认中…")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
            }
        case let .success(message):
            Text(message)
                .font(.subheadline)
                .foregroundStyle(DesignTokens.primary)
        case let .failure(message):
            Text(message)
                .font(.subheadline)
                .foregroundStyle(DesignTokens.danger)
        case .idle:
            if let scanError {
                Text(scanError)
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.danger)
            }
        }
    }

    private var scanButtonTitle: String {
        if case .success = viewModel.phase { return "再扫一次" }
        return "扫一扫"
    }

    /// Non-nil pending ticket drives the confirm alert; dismissing cancels it.
    private var confirmPresented: Binding<Bool> {
        Binding(
            get: { viewModel.pendingTicketId != nil },
            set: { presented in
                if !presented { viewModel.cancelPending() }
            }
        )
    }

    private func startScan() async {
        scanError = nil
        viewModel.reset()
        guard QrScannerView.isSupported else {
            scanError = "此设备不支持扫码。"
            return
        }
        guard await QrScannerView.requestCameraAccess() else {
            scanError = "需要相机权限才能扫码，请在系统设置中允许。"
            return
        }
        showingScanner = true
    }
}

#if DEBUG
#Preview {
    QrLoginCard(viewModel: QrApproveViewModel(client: PreviewAuthClient()))
        .padding(20)
        .background(AuthBackground())
}
#endif
