import GoogleSignInSwift
import SwiftUI

/// The SDK-provided, self-localized Google sign-in button. Kept in its own file so
/// the GoogleSignIn import stays out of ``PhoneStepView`` — the button is purely
/// declarative and hands its tap to the closure; the view model owns the provider
/// call, nonce and server exchange. Rendered only when `auth.googleEnabled`.
struct GoogleAuthButton: View {
    let action: () -> Void

    var body: some View {
        GoogleSignInButton(action: action)
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.radius, style: .continuous))
    }
}
