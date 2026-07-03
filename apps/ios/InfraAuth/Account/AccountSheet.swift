import SwiftUI

/// The account modal — presented as a sheet from the global avatar entry
/// (``AccountAvatarButton``), App Store-style. Profile, current session,
/// appearance, registered devices and recent login history, plus logout.
/// Replaces the former account tab so the signed-in surface keeps its tab bar
/// for business screens only.
struct AccountSheet: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var account: AccountViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let user = auth.user {
                        ProfileCard(user: user)
                    }
                    SessionCard()
                    AppearanceCard()
                    DevicesCard(devices: account.devices, loading: account.loading)
                    LoginEventsCard(events: account.events, loading: account.loading)

                    ErrorBanner(message: account.error)

                    PrimaryButton(title: AuthCopy.Done.logout) {
                        Task { await auth.logout() }
                    }
                    .padding(.top, 4)
                }
                .padding(20)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(AuthBackground())
            .navigationTitle("账户")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                        .tint(DesignTokens.primary)
                }
            }
            .task { await account.load() }
        }
    }
}

/// The global account entry: an App Store-style circular monogram avatar pinned
/// to a screen's nav bar (top-right) that opens ``AccountSheet``. Shown on every
/// signed-in tab so the account is one reachable tap from anywhere.
struct AccountAvatarButton: View {
    let user: AuthUser?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(user.map(monogram) ?? "··")
                .font(.footnote.weight(.medium))
                .foregroundStyle(DesignTokens.primaryForeground)
                .frame(width: 30, height: 30)
                .background(DesignTokens.primary, in: Circle())
        }
        .accessibilityLabel("账户")
    }
}

/// Avatar monogram: first glyph of a name, else the last two phone digits.
private func monogram(_ user: AuthUser) -> String {
    if let name = user.displayName?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
        return String(name.prefix(1)).uppercased()
    }
    let digits = user.phone.filter(\.isNumber)
    return digits.isEmpty ? "··" : String(digits.suffix(2))
}

/// The hero of the account modal: who you are.
struct ProfileCard: View {
    let user: AuthUser

    var body: some View {
        HStack(spacing: 16) {
            Text(monogram(user))
                .font(.title2.weight(.medium))
                .foregroundStyle(DesignTokens.primaryForeground)
                .frame(width: 56, height: 56)
                .background(DesignTokens.primary, in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(user.displayName ?? "未命名用户")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(DesignTokens.textPrimary)
                Text(user.phone)
                    .font(.subheadline.monospaced())
                    .foregroundStyle(DesignTokens.textSecondary)
                Text("注册于 \(Format.date(user.createdAt))")
                    .font(.caption.monospaced())
                    .foregroundStyle(DesignTokens.textSecondary)
                    .padding(.top, 2)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(DesignTokens.surface,
                    in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous)
                .strokeBorder(DesignTokens.border, lineWidth: 1)
        )
    }
}

/// Appearance control: pick system / light / dark. The choice is persisted by
/// ``AppearanceStore`` and applied at the app root; colors themselves come from
/// the shared ``DesignTokens``, which already resolve per scheme.
struct AppearanceCard: View {
    @EnvironmentObject private var appearance: AppearanceStore

    var body: some View {
        SectionCard(title: "外观", systemImage: "circle.lefthalf.filled") {
            Picker("外观", selection: $appearance.preference) {
                ForEach(ThemePreference.allCases) { preference in
                    Text(preference.label).tag(preference)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }
}

/// Current native session facts. iOS rides the Bearer accessToken kept in the Keychain.
struct SessionCard: View {
    var body: some View {
        SectionCard(title: "当前会话", systemImage: "checkmark.shield") {
            VStack(spacing: 0) {
                KeyValueRow(label: "平台") { Badge(text: "iOS") }
                KeyValueRow(label: "凭证") {
                    Text("Bearer · Keychain")
                        .font(.caption.monospaced())
                        .foregroundStyle(DesignTokens.textPrimary)
                }
                KeyValueRow(label: "状态") { Badge(text: "活跃", style: .success) }
            }
        }
    }
}

/// Registered native installs for the current user.
struct DevicesCard: View {
    let devices: [DeviceDTO]?
    let loading: Bool

    var body: some View {
        SectionCard(title: "设备", systemImage: "iphone") {
            if loading {
                VStack(spacing: 8) {
                    SkeletonBar(widthFraction: 1, height: 34)
                    SkeletonBar(widthFraction: 0.66, height: 34)
                }
            } else if let devices, !devices.isEmpty {
                VStack(spacing: 12) {
                    ForEach(devices) { device in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(device.model ?? "未知机型")
                                    .font(.subheadline)
                                    .foregroundStyle(DesignTokens.textPrimary)
                                Text("最近 \(Format.date(device.lastSeenAt))")
                                    .font(.caption.monospaced())
                                    .foregroundStyle(DesignTokens.textSecondary)
                            }
                            Spacer(minLength: 8)
                            Badge(text: Format.platformLabel(device.platform))
                        }
                    }
                }
            } else {
                Text("还没有原生设备登录。iOS / Android / HarmonyOS 客户端登录后会出现在这里。")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
            }
        }
    }
}

/// Recent OTP verification attempts (success and failure), newest first.
struct LoginEventsCard: View {
    let events: [LoginEventDTO]?
    let loading: Bool

    var body: some View {
        SectionCard(title: "最近登录", systemImage: "clock.arrow.circlepath") {
            if loading {
                VStack(spacing: 8) {
                    SkeletonBar(widthFraction: 1, height: 28)
                    SkeletonBar(widthFraction: 1, height: 28)
                    SkeletonBar(widthFraction: 0.8, height: 28)
                }
            } else if let events, !events.isEmpty {
                VStack(spacing: 0) {
                    ForEach(events) { event in
                        HStack(spacing: 8) {
                            Text(Format.dateTime(event.createdAt))
                                .font(.caption.monospaced())
                                .foregroundStyle(DesignTokens.textSecondary)
                            Spacer(minLength: 8)
                            if let ip = event.ip {
                                Text(ip)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(DesignTokens.textSecondary)
                            }
                            Badge(text: Format.platformLabel(event.platform))
                            Badge(text: event.success ? "成功" : "失败",
                                  style: event.success ? .success : .destructive)
                        }
                        .frame(height: 40)
                    }
                }
            } else {
                Text("还没有登录记录。")
                    .font(.subheadline)
                    .foregroundStyle(DesignTokens.textSecondary)
            }
        }
    }
}

#if DEBUG
#Preview {
    AccountSheet()
        .environmentObject(AuthViewModel(client: PreviewAuthClient()))
        .environmentObject(AccountViewModel(client: PreviewAuthClient()))
        .environmentObject(AppearanceStore())
}
#endif
