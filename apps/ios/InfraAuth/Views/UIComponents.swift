import SwiftUI

/// Shared surfaces for the authenticated screens (account + todos), built from
/// the same ``DesignTokens`` as the auth flow. Mirrors web's `Card` / `Badge` /
/// `Skeleton` primitives. No hand-picked colors live here.

/// A titled content card: an icon + title header over arbitrary content.
/// Mirrors web's `Card` + `CardHeader`/`CardTitle` + `CardContent`.
struct SectionCard<Content: View>: View {
    let title: String
    var systemImage: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.footnote)
                        .foregroundStyle(DesignTokens.textSecondary)
                }
                Text(title)
                    .font(.headline)
                    .foregroundStyle(DesignTokens.textPrimary)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(DesignTokens.surface,
                    in: RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous)
                .strokeBorder(DesignTokens.border, lineWidth: 1)
        )
    }
}

/// Small pill label. Mirrors web's `Badge` variants.
struct Badge: View {
    enum Style { case outline, success, destructive }

    let text: String
    var style: Style = .outline

    private var foreground: Color {
        switch style {
        case .outline: return DesignTokens.textSecondary
        case .success: return DesignTokens.primary
        case .destructive: return DesignTokens.danger
        }
    }

    private var background: Color {
        switch style {
        case .outline: return .clear
        case .success: return DesignTokens.primary.opacity(0.12)
        case .destructive: return DesignTokens.danger.opacity(0.12)
        }
    }

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background,
                        in: RoundedRectangle(cornerRadius: DesignTokens.radius * 0.6, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.radius * 0.6, style: .continuous)
                    .strokeBorder(DesignTokens.border, lineWidth: style == .outline ? 1 : 0)
            )
    }
}

/// A shimmering placeholder bar for loading states. Mirrors web's `Skeleton`.
struct SkeletonBar: View {
    var widthFraction: CGFloat = 1
    var height: CGFloat = 20

    var body: some View {
        GeometryReader { geo in
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(DesignTokens.textSecondary.opacity(0.12))
                .frame(width: geo.size.width * widthFraction, height: height)
        }
        .frame(height: height)
    }
}

/// Fixed-height key/value row so values don't jitter as content changes.
/// Mirrors the `Row` in web's session card.
struct KeyValueRow<Value: View>: View {
    let label: String
    @ViewBuilder var value: Value

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(DesignTokens.textSecondary)
            Spacer()
            value
        }
        .frame(height: 36)
        .overlay(alignment: .bottom) {
            Rectangle().fill(DesignTokens.border.opacity(0.6)).frame(height: 1)
        }
    }
}
