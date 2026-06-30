import SwiftUI

/// Shared visual language for the auth flow — keeps the three step views
/// consistent without pulling in any asset catalog colors.
enum AuthTheme {
    static let accent = Color(red: 0.36, green: 0.42, blue: 0.95)
    static let accentDeep = Color(red: 0.24, green: 0.20, blue: 0.62)

    static let backgroundGradient = LinearGradient(
        colors: [accentDeep, accent],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

/// Full-bleed brand background used behind every step.
struct AuthBackground: View {
    var body: some View {
        AuthTheme.backgroundGradient
            .ignoresSafeArea()
            .overlay(alignment: .top) {
                Circle()
                    .fill(.white.opacity(0.08))
                    .frame(width: 320, height: 320)
                    .blur(radius: 8)
                    .offset(y: -160)
            }
    }
}

/// White rounded card the step content sits in.
struct AuthCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            content
        }
        .padding(24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, 20)
        .shadow(color: .black.opacity(0.18), radius: 24, y: 12)
    }
}

/// Filled primary button that shows a spinner while `loading`.
struct PrimaryButton: View {
    let title: String
    var loading = false
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title).opacity(loading ? 0 : 1)
                if loading { ProgressView().tint(.white) }
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .foregroundStyle(.white)
            .background(AuthTheme.accent.opacity(enabled ? 1 : 0.4),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .disabled(!enabled || loading)
    }
}

/// Inline error banner; renders nothing when `message` is nil.
struct ErrorBanner: View {
    let message: String?

    var body: some View {
        if let message {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote)
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
        }
    }
}
