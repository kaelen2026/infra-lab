import Foundation

/// The OIDC material a native Google sign-in yields for the server exchange:
/// the ID token to POST, and the RAW nonce (if the provider bound one) whose
/// SHA-256 was set on the Google request — the server re-derives and compares
/// it, exactly like the Sign in with Apple flow.
struct GoogleSignInCredential: Equatable, Sendable {
    let idToken: String
    /// Raw nonce sent to our server; `nil` when the provider bound none.
    let nonce: String?
}

/// Failure raised by a ``GoogleSignInProvider``. `.cancelled` is a silent user
/// dismissal (mirrors `ASAuthorizationError.canceled`); the view model must not
/// surface it as an error. `.unavailable` means no real provider is wired yet
/// (the placeholder default) or the SDK could not present.
enum GoogleSignInError: Error, Equatable {
    case cancelled
    case unavailable
}

/// Port for the platform's Google Sign-In SDK. The view model depends on this
/// protocol — never a concrete adapter — so tests inject an in-memory fake and
/// this logic layer stays free of any GoogleSignIn SDK import. The real adapter
/// (which presents the Google sheet, generates + hashes the nonce, and maps the
/// SDK's cancel error to ``GoogleSignInError/cancelled``) is wired separately.
protocol GoogleSignInProvider {
    /// Present the Google sign-in UI and return the ID token to exchange with our
    /// server. Throws ``GoogleSignInError/cancelled`` when the user dismisses it.
    func signIn() async throws -> GoogleSignInCredential
}

/// Placeholder used as the ``AuthViewModel`` default until the real GoogleSignIn
/// adapter is injected at the composition root. Always reports the provider as
/// unavailable, so an accidental trigger surfaces shared error copy rather than
/// silently doing nothing.
struct UnavailableGoogleSignInProvider: GoogleSignInProvider {
    func signIn() async throws -> GoogleSignInCredential {
        throw GoogleSignInError.unavailable
    }
}
