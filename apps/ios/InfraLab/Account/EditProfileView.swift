import PhotosUI
import SwiftUI

/// Edit the current user's profile: change the display name and pick a new
/// avatar. Pushed from ``ProfileCard`` inside the account sheet's navigation
/// stack. All networking lives in ``AccountViewModel``; on success the refreshed
/// user is pushed into ``AuthViewModel`` so every screen bound to `user` updates.
struct EditProfileView: View {
    let user: AuthUser

    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var account: AccountViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var displayName: String
    @State private var pickerItem: PhotosPickerItem?

    init(user: AuthUser) {
        self.user = user
        _displayName = State(initialValue: user.displayName ?? "")
    }

    /// The freshest user available: after an avatar upload ``AuthViewModel`` holds
    /// the updated record, so the preview reflects the new image immediately.
    private var currentUser: AuthUser { auth.user ?? user }

    private var trimmedName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSaveName: Bool {
        !account.editBusy && !trimmedName.isEmpty && trimmedName != (currentUser.displayName ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                avatarSection
                nameSection
                ErrorBanner(message: account.editError)
            }
            .padding(20)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(AuthBackground())
        .navigationTitle("编辑资料")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { await pickAvatar(item) }
        }
    }

    // MARK: - Sections

    private var avatarSection: some View {
        VStack(spacing: 12) {
            Avatar(user: currentUser, diameter: 96, font: .largeTitle.weight(.medium))
            PhotosPicker(selection: $pickerItem, matching: .images) {
                Label("更换头像", systemImage: "photo")
            }
            .font(.subheadline)
            .tint(DesignTokens.primary)
            .disabled(account.editBusy)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private var nameSection: some View {
        SectionCard(title: "用户名", systemImage: "person") {
            VStack(alignment: .leading, spacing: 12) {
                TextField("请输入用户名", text: $displayName)
                    .textFieldStyle(.roundedBorder)
                    .disabled(account.editBusy)
                Text("最多 \(ProfileLimits.displayNameMaxLength) 个字符")
                    .font(.caption)
                    .foregroundStyle(DesignTokens.textSecondary)
                PrimaryButton(title: "保存", loading: account.editBusy, enabled: canSaveName) {
                    saveName()
                }
            }
        }
    }

    // MARK: - Actions

    private func saveName() {
        Task {
            if let updated = await account.saveDisplayName(displayName) {
                auth.apply(updated)
                dismiss()
            }
        }
    }

    private func pickAvatar(_ item: PhotosPickerItem) async {
        pickerItem = nil
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            account.editError = "无法读取该图片，请换一张。"
            return
        }
        if let updated = await account.uploadAvatar(image) {
            auth.apply(updated)
        }
    }
}

#if DEBUG
#Preview {
    NavigationStack {
        EditProfileView(user: .preview)
            .environmentObject(AuthViewModel(client: PreviewAuthClient()))
            .environmentObject(AccountViewModel(client: PreviewAuthClient()))
    }
}
#endif
