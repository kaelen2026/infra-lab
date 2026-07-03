import SwiftUI

/// App-global service-status bar. Renders nothing while the server is reachable
/// (`.online`/`.unknown`); slides in a warning when the backend is degraded or
/// unreachable, with a retry that re-probes on demand. Built from ``DesignTokens``
/// only — no hand-picked colors. Attached as a top safe-area inset in ``RootView``
/// so it sits above both the auth flow and the signed-in tabs.
struct ServerStatusBanner: View {
    @EnvironmentObject private var monitor: ServerStatusMonitor

    var body: some View {
        Group {
            switch monitor.status {
            case .offline:
                bar(
                    icon: "wifi.slash",
                    text: "无法连接服务器,请检查网络后重试",
                    tint: DesignTokens.danger
                )
            case .degraded:
                bar(
                    icon: "exclamationmark.triangle.fill",
                    text: "服务器暂时不可用,部分功能可能异常",
                    tint: DesignTokens.primary
                )
            case .online, .unknown:
                EmptyView()
            }
        }
        .animation(.snappy, value: monitor.status)
    }

    private func bar(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.footnote)
            Text(text)
                .font(.footnote.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button(action: { Task { await monitor.refresh() } }) {
                if monitor.checking {
                    ProgressView().controlSize(.mini).tint(tint)
                } else {
                    Text("重试").font(.footnote.weight(.semibold))
                }
            }
            .disabled(monitor.checking)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.12))
        .overlay(alignment: .bottom) {
            Rectangle().fill(tint.opacity(0.25)).frame(height: 1)
        }
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

#if DEBUG
#Preview("Offline") {
    Color.clear
        .safeAreaInset(edge: .top, spacing: 0) { ServerStatusBanner() }
        .environmentObject(ServerStatusMonitor.preview(.offline))
}

#Preview("Degraded") {
    Color.clear
        .safeAreaInset(edge: .top, spacing: 0) { ServerStatusBanner() }
        .environmentObject(ServerStatusMonitor.preview(.degraded))
}
#endif
