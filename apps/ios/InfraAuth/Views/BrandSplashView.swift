import SwiftUI

/// Segment B — the in-app brand splash shown over the warm-paper background
/// while the launch-time session restore runs. A clay OTP speech bubble (three
/// dots = a verification code) locks up above the tracked wordmark and tagline,
/// mirroring the bubble mark the Android client uses. Purely presentational:
/// all timing/dismissal lives in ``RootView``.
struct BrandSplashView: View {
    @State private var markVisible = false
    @State private var textVisible = false

    var body: some View {
        ZStack {
            AuthBackground()

            VStack(spacing: 22) {
                bubble
                    .frame(width: 108, height: 108)
                    .opacity(markVisible ? 1 : 0)
                    .scaleEffect(markVisible ? 1 : 0.96)

                VStack(spacing: 8) {
                    Text(AuthCopy.brand.uppercased())
                        .font(.system(.title, design: .serif).weight(.semibold))
                        .kerning(2)
                        .foregroundStyle(DesignTokens.textPrimary)
                    Text(AuthCopy.tagline)
                        .font(.subheadline)
                        .foregroundStyle(DesignTokens.textSecondary)
                }
                .multilineTextAlignment(.center)
                .opacity(textVisible ? 1 : 0)
            }
            .padding(.horizontal, 32)
        }
        .onAppear {
            // Bubble fades + eases up to full scale first; the wordmark and
            // tagline follow. Driven by withAnimation with a delay, so there is
            // no long-running Task to cancel or leak.
            withAnimation(.easeOut(duration: 0.25)) { markVisible = true }
            withAnimation(.easeOut(duration: 0.3).delay(0.22)) { textVisible = true }
        }
    }

    /// The clay speech-bubble mark with three code dots.
    private var bubble: some View {
        SpeechBubble()
            .fill(DesignTokens.primary)
            .overlay {
                HStack(spacing: 9) {
                    ForEach(0..<3, id: \.self) { _ in
                        Circle()
                            .fill(DesignTokens.primaryForeground)
                            .frame(width: 11, height: 11)
                    }
                }
                // Lift the dots off the tail so they read as centered in the body.
                .offset(y: -9)
            }
            .accessibilityHidden(true)
    }
}

/// A rounded chat bubble with a tail at the bottom-left. Drawn as a single
/// ``Path`` so it fills crisply at any size (no SF Symbol — the mark is bespoke,
/// matching the OTP-bubble concept shared with Android).
struct SpeechBubble: Shape {
    var cornerRadius: CGFloat = 26
    var tailWidth: CGFloat = 22
    var tailHeight: CGFloat = 18

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let radius = min(cornerRadius, min(rect.width, rect.height - tailHeight) / 2)
        // The rounded body sits above the tail, which drops from the bottom edge.
        let body = CGRect(
            x: rect.minX,
            y: rect.minY,
            width: rect.width,
            height: rect.height - tailHeight
        )

        let tailLeftX = body.minX + radius + 6
        let tailRightX = tailLeftX + tailWidth

        // Top-left → clockwise.
        path.move(to: CGPoint(x: body.minX + radius, y: body.minY))
        path.addLine(to: CGPoint(x: body.maxX - radius, y: body.minY))
        path.addArc(
            center: CGPoint(x: body.maxX - radius, y: body.minY + radius),
            radius: radius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false
        )
        path.addLine(to: CGPoint(x: body.maxX, y: body.maxY - radius))
        path.addArc(
            center: CGPoint(x: body.maxX - radius, y: body.maxY - radius),
            radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false
        )
        // Bottom edge (right → left), diverting down into the tail.
        path.addLine(to: CGPoint(x: tailRightX, y: body.maxY))
        path.addLine(to: CGPoint(x: tailLeftX + 3, y: rect.maxY))
        path.addLine(to: CGPoint(x: tailLeftX, y: body.maxY))
        path.addLine(to: CGPoint(x: body.minX + radius, y: body.maxY))
        path.addArc(
            center: CGPoint(x: body.minX + radius, y: body.maxY - radius),
            radius: radius, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false
        )
        path.addLine(to: CGPoint(x: body.minX, y: body.minY + radius))
        path.addArc(
            center: CGPoint(x: body.minX + radius, y: body.minY + radius),
            radius: radius, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false
        )
        path.closeSubpath()
        return path
    }
}

#if DEBUG
#Preview {
    BrandSplashView()
}
#endif
